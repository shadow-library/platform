import { and, asc, eq, inArray, lte, ne, notExists, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Bot, DatabaseService, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/modules/infrastructure/datastore';

import { BotApplicationService } from './bot-application.service';
import { MAX_TRANSFER_ATTEMPTS, MAX_TRANSFER_BACKOFF_MINUTES, TRANSFER_BATCH_LIMIT } from './bot-ownership.constants';
import { BotOwnershipClient } from './bot-ownership.client';
import {
  type BotApplicationOwnership,
  type BotAwareApplication,
  type BotDeletionProgress,
  type BotOwnedRecords,
  type BotOwnership,
  type BotTransferState,
} from './bot-ownership.types';

const CLAIMABLE_STATUSES: Bot.OwnershipTransferStatus[] = ['PENDING', 'FAILED'];

/**
 * Out of attempts and not landed — deliberately keyed on the attempt count rather than the FAILED
 * status. A row whose own `DONE` write failed stays PENDING with its attempt spent, and keying on
 * FAILED alone would leave it past the claim ceiling, invisible to the bot's deletion state and
 * beyond the reach of a retry.
 */
const exhaustedRow = sql`${schema.botOwnershipTransfers.attempts} >= ${MAX_TRANSFER_ATTEMPTS} AND ${schema.botOwnershipTransfers.status} <> 'DONE'`;

const isExhausted = (status: Bot.OwnershipTransferStatus, attempts: number): boolean => attempts >= MAX_TRANSFER_ATTEMPTS && status !== 'DONE';

@Injectable()
export class BotOwnershipService {
  private readonly logger = Logger.getLogger(APP_NAME, BotOwnershipService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly botApplicationService: BotApplicationService,
    private readonly botOwnershipClient: BotOwnershipClient,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  listBotAwareApplications(executor?: PrimaryTransaction): Promise<BotAwareApplication[]> {
    return this.botApplicationService.listBotAware(executor);
  }

  /** Applications are queried concurrently and each is bounded separately, so one slow application costs the budget once rather than once per application. */
  async collect(botId: bigint): Promise<BotOwnership> {
    const [available, transfers] = await Promise.all([this.listBotAwareApplications(), this.describeTransfers(botId)]);
    const applications = await Promise.all(available.map(application => this.countOwned(application, botId)));
    return { applications, degraded: applications.some(application => !application.available), transfers };
  }

  async enqueue(tx: PrimaryTransaction, botId: bigint, toUserId: bigint, applications: BotAwareApplication[]): Promise<number> {
    if (applications.length === 0) return 0;
    const inserted = await tx
      .insert(schema.botOwnershipTransfers)
      .values(applications.map(application => ({ botId, applicationId: application.id, toUserId })))
      .onConflictDoNothing()
      .returning({ id: schema.botOwnershipTransfers.id });
    return inserted.length;
  }

  async describeTransfers(botId: bigint): Promise<BotTransferState[]> {
    const rows = await this.db
      .select({
        applicationId: schema.botOwnershipTransfers.applicationId,
        name: schema.applications.name,
        displayName: schema.applications.displayName,
        status: schema.botOwnershipTransfers.status,
        attempts: schema.botOwnershipTransfers.attempts,
        nextAttemptAt: schema.botOwnershipTransfers.nextAttemptAt,
        completedAt: schema.botOwnershipTransfers.completedAt,
      })
      .from(schema.botOwnershipTransfers)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.botOwnershipTransfers.applicationId))
      .where(eq(schema.botOwnershipTransfers.botId, botId))
      .orderBy(asc(schema.applications.name));

    return rows.map(row => ({ ...row, exhausted: isExhausted(row.status, row.attempts) }));
  }

  async progressFor(botIds: bigint[]): Promise<Map<bigint, BotDeletionProgress>> {
    if (botIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        botId: schema.botOwnershipTransfers.botId,
        requestedAt: sql<Date>`min(${schema.botOwnershipTransfers.createdAt})`.mapWith(schema.botOwnershipTransfers.createdAt),
        transferTo: sql<bigint>`min(${schema.botOwnershipTransfers.toUserId})`.mapWith(schema.botOwnershipTransfers.toUserId),
        pending: sql<number>`count(*) FILTER (WHERE ${schema.botOwnershipTransfers.status} = 'PENDING')`.mapWith(Number),
        done: sql<number>`count(*) FILTER (WHERE ${schema.botOwnershipTransfers.status} = 'DONE')`.mapWith(Number),
        failed: sql<number>`count(*) FILTER (WHERE ${schema.botOwnershipTransfers.status} = 'FAILED')`.mapWith(Number),
        stalled: sql<boolean>`bool_or(${exhaustedRow})`,
        /** Display names, so the detail response can report a stuck handover exactly as the ownership fan-out would, without making it. */
        stalledApplications: sql<
          string[]
        >`coalesce(array_agg(coalesce(${schema.applications.displayName}, ${schema.applications.name}) ORDER BY ${schema.applications.name}) FILTER (WHERE ${exhaustedRow}), '{}')`,
      })
      .from(schema.botOwnershipTransfers)
      .innerJoin(schema.applications, eq(schema.applications.id, schema.botOwnershipTransfers.applicationId))
      .where(inArray(schema.botOwnershipTransfers.botId, botIds))
      .groupBy(schema.botOwnershipTransfers.botId);
    return new Map(rows.map(({ botId, ...progress }) => [botId, progress]));
  }

  /**
   * Returns the rows handed back to the worker; nothing is retried until the next tick claims them
   * again. The attempt window comes from the database clock, which is the one the claim compares
   * against — a worker running slightly ahead would otherwise leave the row unclaimable.
   */
  async retryExhausted(botId: bigint): Promise<number> {
    const reset = await this.db
      .update(schema.botOwnershipTransfers)
      .set({ status: 'PENDING', attempts: 0, lastError: null, nextAttemptAt: sql`now()`, updatedAt: new Date() })
      .where(and(eq(schema.botOwnershipTransfers.botId, botId), exhaustedRow))
      .returning({ id: schema.botOwnershipTransfers.id });
    if (reset.length > 0) this.logger.info('reset exhausted bot ownership transfers', { botId: botId.toString(), reset: reset.length });
    return reset.length;
  }

  /**
   * Claiming stamps the next attempt window and consumes an attempt in the same transaction, so a
   * worker that dies mid-call cannot leave a row that every replica keeps re-claiming. The registry
   * is read before the claim: a failure there must not burn an attempt on rows no application was
   * ever contacted for. Rows are dispatched concurrently — each is independently isolated, and a
   * serial batch would hold the shared worker tick for the whole batch's timeout budget.
   */
  async dispatchPending(): Promise<number> {
    const applications = new Map((await this.listBotAwareApplications()).map(application => [application.id, application]));
    const claimed = await this.claim();
    if (claimed.length === 0) return 0;

    /** Settled, not all: a rejection from one row's bookkeeping must not skip the finalisation pass for every other bot in the batch. */
    const outcomes = await Promise.allSettled(claimed.map(row => this.dispatchOne(row, applications)));
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') this.logger.error('bot ownership transfer dispatch threw', { error: outcome.reason });
    }

    for (const botId of new Set(claimed.map(row => row.botId))) {
      await this.finalise(botId).catch(error => this.logger.error('failed to complete a bot deletion', { botId: botId.toString(), error }));
    }
    return outcomes.filter(outcome => outcome.status === 'fulfilled' && outcome.value).length;
  }

  /**
   * Completes every `DELETING` bot whose transfers have all landed. `dispatchPending` finalises the
   * bots in its own batch, but a crash between the last transfer's bookkeeping and that step leaves
   * the bot stranded: `claim` only ever revisits `PENDING`/`FAILED` rows, so nothing else would.
   */
  async recoverCompletedDeletions(): Promise<number> {
    const outstanding = this.db
      .select({ botId: schema.botOwnershipTransfers.botId })
      .from(schema.botOwnershipTransfers)
      .where(and(eq(schema.botOwnershipTransfers.botId, schema.bots.id), ne(schema.botOwnershipTransfers.status, 'DONE')));

    const stranded = await this.db
      .select({ id: schema.bots.id })
      .from(schema.bots)
      .where(and(eq(schema.bots.status, 'DELETING'), notExists(outstanding)));

    let completed = 0;
    for (const bot of stranded) {
      const finalised = await this.finalise(bot.id).catch(error => {
        this.logger.error('failed to complete a stranded bot deletion', { botId: bot.id.toString(), error });
        return false;
      });
      if (finalised) completed += 1;
    }
    if (completed > 0) this.logger.warn('completed bot deletions stranded by an interrupted worker', { completed });
    return completed;
  }

  private async dispatchOne(row: Bot.OwnershipTransfer, applications: Map<number, BotAwareApplication>): Promise<boolean> {
    const application = applications.get(row.applicationId);
    if (!application) {
      await this.markFailed(row, AppError.internal('application no longer exposes a bot ownership scope'));
      return false;
    }

    let moved: BotOwnedRecords[];
    try {
      moved = await this.botOwnershipClient.transfer(application, row.botId, row.toUserId);
    } catch (error) {
      await this.markFailed(row, error);
      return false;
    }

    /**
     * The records have already moved upstream. Marking the row FAILED because the bookkeeping that
     * follows failed would re-queue and re-apply an applied transfer, so every failure past this
     * point is logged and left for the lease to retry.
     */
    await this.markDone(row, application, moved).catch(error =>
      this.logger.error('failed to record a completed bot ownership transfer', { botId: row.botId.toString(), application: application.name, error }),
    );
    return true;
  }

  private async countOwned(application: BotAwareApplication, botId: bigint): Promise<BotApplicationOwnership> {
    const base = { applicationId: application.id, name: application.name, displayName: application.displayName, logoUrl: application.logoUrl };
    try {
      const records = await this.botOwnershipClient.countOwned(application, botId);
      return { ...base, available: true, records, total: records.reduce((sum, record) => sum + record.count, 0) };
    } catch (error) {
      this.logger.warn('bot ownership lookup failed', { application: application.name, botId: botId.toString(), error });
      return { ...base, available: false, records: [], total: 0 };
    }
  }

  private claim(): Promise<Bot.OwnershipTransfer[]> {
    return this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.botOwnershipTransfers)
        .where(
          and(
            inArray(schema.botOwnershipTransfers.status, CLAIMABLE_STATUSES),
            lte(schema.botOwnershipTransfers.attempts, MAX_TRANSFER_ATTEMPTS - 1),
            lte(schema.botOwnershipTransfers.nextAttemptAt, sql`now()`),
          ),
        )
        .orderBy(asc(schema.botOwnershipTransfers.nextAttemptAt))
        .limit(TRANSFER_BATCH_LIMIT)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];

      // The lease is derived in SQL from each row's own attempt count, so one statement claims the whole batch with a per-row backoff.
      await tx
        .update(schema.botOwnershipTransfers)
        .set({
          attempts: sql`${schema.botOwnershipTransfers.attempts} + 1`,
          nextAttemptAt: sql`now() + make_interval(mins => least(power(2, ${schema.botOwnershipTransfers.attempts} + 1)::int, ${MAX_TRANSFER_BACKOFF_MINUTES}))`,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            schema.botOwnershipTransfers.id,
            rows.map(row => row.id),
          ),
        );
      return rows.map(row => ({ ...row, attempts: row.attempts + 1 }));
    });
  }

  private async markDone(row: Bot.OwnershipTransfer, application: BotAwareApplication, moved: { kind: string; count: number }[]): Promise<void> {
    await this.db
      .update(schema.botOwnershipTransfers)
      .set({ status: 'DONE', completedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(schema.botOwnershipTransfers.id, row.id));

    const bot = await this.db.query.bots.findFirst({ where: eq(schema.bots.id, row.botId), columns: { organisationId: true } });
    if (!bot) return;

    await this.auditService.record({
      action: 'bot.ownership.transferred',
      outcome: 'SUCCESS',
      actorType: 'SYSTEM',
      actorId: null,
      organisationId: bot.organisationId.toString(),
      targetType: 'bot',
      targetId: row.botId.toString(),
      detail: { application: application.name, toUserId: row.toUserId.toString(), attempts: row.attempts, moved: Object.fromEntries(moved.map(item => [item.kind, item.count])) },
    });
  }

  private async markFailed(row: Bot.OwnershipTransfer, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = row.attempts >= MAX_TRANSFER_ATTEMPTS;
    await this.db.update(schema.botOwnershipTransfers).set({ status: 'FAILED', lastError: message, updatedAt: new Date() }).where(eq(schema.botOwnershipTransfers.id, row.id));
    this.logger[exhausted ? 'error' : 'warn'](exhausted ? 'bot ownership transfer exhausted its attempts' : 'bot ownership transfer failed', {
      botId: row.botId.toString(),
      applicationId: row.applicationId,
      attempts: row.attempts,
      message,
    });
  }

  /** The bot row is the tombstone: the handle stays reserved and audit joins keep resolving after deletion. */
  private async finalise(botId: bigint): Promise<boolean> {
    const outstanding = await this.db.$count(schema.botOwnershipTransfers, and(eq(schema.botOwnershipTransfers.botId, botId), ne(schema.botOwnershipTransfers.status, 'DONE')));
    if (outstanding > 0) return false;

    const [deleted] = await this.db
      .update(schema.bots)
      .set({ status: 'DELETED', deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.bots.id, botId), eq(schema.bots.status, 'DELETING')))
      .returning();
    if (!deleted) return false;

    /** The bot is already DELETED and the sweep only revisits DELETING, so letting this bubble would lose the entry for good. */
    await this.auditService
      .record({
        action: 'bot.deleted',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        actorId: null,
        organisationId: deleted.organisationId.toString(),
        targetType: 'bot',
        targetId: botId.toString(),
        detail: { handle: deleted.handle, clientId: deleted.clientId },
      })
      .catch(error => this.logger.error('failed to audit a completed bot deletion', { botId: botId.toString(), handle: deleted.handle, error }));
    this.logger.info('completed organisation bot deletion', { organisationId: deleted.organisationId.toString(), botId: botId.toString(), handle: deleted.handle });
    return true;
  }
}
