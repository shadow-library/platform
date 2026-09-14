import assert from 'node:assert';

import { and, asc, eq, exists, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, ValidationError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, ERROR_MESSAGES } from '@server/constants';
import { PolicyDecisionService } from '@server/modules/authz';
import { type BotDeletionProgress, type BotOwnership, BotOwnershipService } from '@server/modules/identity/bot-ownership';
import { AuditService } from '@server/modules/infrastructure/audit';
import { type Bot, DatabaseService, type Organisation, type PrimaryDatabase, schema, type User } from '@server/modules/infrastructure/datastore';
import { ApplicationService } from '@server/modules/system/application';

import { generateBotClientId } from './bot-key.util';
import { assertOrganisationActive, findBot, findManageableBot, MANAGEABLE_BOT_STATUSES } from './bot-lookup.util';
import { type BotGrantInput, BotPermissionService } from './bot-permission.service';
import { type BotUserRefLookup, resolveUserRefs } from './bot-user-ref.util';
import { BOT_ACCESS_TOKEN_TTL_SECONDS } from './bot.constants';
import { type BotActor, type BotUserRef } from './bot.types';
import { normaliseIpAllowlist } from './ip-allowlist.util';

export interface BotSummary {
  id: bigint;
  clientId: string;
  handle: string;
  displayName: string;
  description: string | null;
  status: Bot.Status;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  activeKeyCount: number;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  nextKeyExpiresAt: Date | null;
  createdBy: BotUserRef | null;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
  suspendedBy: BotUserRef | null;
  deletion: BotDeletionSummary | null;
}

export interface BotDeletionSummary extends Omit<BotDeletionProgress, 'transferTo'> {
  transferTo: BotUserRef | null;
}

export interface DeleteBot {
  transferToUserId: bigint;
  confirmHandle: string;
}

export interface BotTransferRecipient {
  userId: bigint;
  role: Organisation.MemberRole;
  displayName: string | null;
  email: string | null;
}

export interface BotOwnershipView extends BotOwnership {
  recipients: BotTransferRecipient[];
}

/** Accounts that may be handed a bot's records. See `recipientEligible`. */
const RECIPIENT_ELIGIBLE_ACCOUNT_STATUSES: User.Status[] = ['ACTIVE'];

export interface BotUsage {
  count: number;
  limit: number;
}

export interface BotListing {
  bots: BotSummary[];
  usage: BotUsage;
}

export interface CreateBot {
  handle: string;
  displayName: string;
  description?: string;
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
  grants?: BotGrantInput[];
}

export interface UpdateBot {
  displayName?: string;
  description?: string | null;
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
}

interface KeyStats {
  activeKeyCount: number;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  nextKeyExpiresAt: Date | null;
}

type BotChanges = Partial<Pick<Bot, 'displayName' | 'description' | 'ipAllowlist' | 'rateLimitPerMinute'>>;

export const MAX_BOTS_PER_ORGANISATION = 25;
export const MAX_BOT_RATE_LIMIT_PER_MINUTE = 600;

const EMPTY_KEY_STATS: KeyStats = { activeKeyCount: 0, lastUsedAt: null, lastUsedIp: null, nextKeyExpiresAt: null };

@Injectable()
export class BotService {
  private readonly logger = Logger.getLogger(APP_NAME, BotService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly applicationService: ApplicationService,
    private readonly auditService: AuditService,
    private readonly botPermissionService: BotPermissionService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly botOwnershipService: BotOwnershipService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  async listBots(organisationId: bigint): Promise<BotListing> {
    const rows = await this.db.query.bots.findMany({
      where: and(eq(schema.bots.organisationId, organisationId), ne(schema.bots.status, 'DELETED')),
      orderBy: asc(schema.bots.id),
    });
    return { bots: await this.summarise(rows), usage: { count: rows.length, limit: MAX_BOTS_PER_ORGANISATION } };
  }

  async getBot(organisationId: bigint, botId: bigint): Promise<BotSummary> {
    const bot = await this.requireBot(organisationId, botId);
    const [summary] = await this.summarise([bot]);
    assert(summary, 'Bot summary is missing');
    return summary;
  }

  async createBot(actor: BotActor, organisationId: bigint, input: CreateBot): Promise<BotSummary> {
    const ipAllowlist = normaliseIpAllowlist(input.ipAllowlist ?? []);
    const platformApplication = this.applicationService.getApplicationOrThrow(APP_NAME);
    const grants = await this.botPermissionService.prepareGrants(organisationId, input.grants ?? []);

    const { bot, granted } = await this.db.transaction(async tx => {
      // Serialises concurrent creates so two cannot both pass the limit check; NO KEY UPDATE leaves FK inserts elsewhere in the organisation unblocked.
      const [organisation] = await tx
        .select({ type: schema.organisations.type, status: schema.organisations.status })
        .from(schema.organisations)
        .where(eq(schema.organisations.id, organisationId))
        .for('no key update');
      if (!organisation || organisation.status !== 'ACTIVE') throw AppErrorCode.ORG_002.create();
      if (organisation.type !== 'TEAM') throw AppErrorCode.BOT_002.create();

      const existing = await tx.$count(schema.bots, and(eq(schema.bots.organisationId, organisationId), ne(schema.bots.status, 'DELETED')));
      if (existing >= MAX_BOTS_PER_ORGANISATION) throw AppErrorCode.BOT_001.create();

      const taken = await tx.query.bots.findFirst({ where: and(eq(schema.bots.organisationId, organisationId), eq(schema.bots.handle, input.handle)), columns: { id: true } });
      if (taken) throw AppErrorCode.BOT_003.create();

      const clientId = generateBotClientId();
      await tx.insert(schema.oauthClients).values({
        id: clientId,
        applicationId: platformApplication.id,
        name: `${input.handle}[bot]`,
        kind: 'SERVICE',
        isFirstParty: false,
        tokenEndpointAuthMethod: 'client_secret_basic',
        grantTypes: [],
        accessTokenTtl: BOT_ACCESS_TOKEN_TTL_SECONDS,
        organisationId,
      });

      const [created] = await tx
        .insert(schema.bots)
        .values({
          organisationId,
          clientId,
          handle: input.handle,
          displayName: input.displayName,
          description: input.description ?? null,
          ipAllowlist,
          rateLimitPerMinute: input.rateLimitPerMinute ?? MAX_BOT_RATE_LIMIT_PER_MINUTE,
          createdBy: actor.userId,
        })
        .returning()
        .catch(error => this.databaseService.translateError(error));
      assert(created, 'Bot insertion returned no row');

      const granted = await this.botPermissionService.grantInTransaction(tx, actor, created, grants);
      return { bot: created, granted };
    });

    await this.record(actor, bot, 'bot.created', { handle: bot.handle, clientId: bot.clientId, ipAllowlist: bot.ipAllowlist, rateLimitPerMinute: bot.rateLimitPerMinute });
    await this.botPermissionService.announceChange(actor, bot, { added: granted, removed: [] });
    this.logger.info('created organisation bot', { organisationId: organisationId.toString(), botId: bot.id.toString(), clientId: bot.clientId });
    return this.getBot(organisationId, bot.id);
  }

  async updateBot(actor: BotActor, organisationId: bigint, botId: bigint, input: UpdateBot): Promise<void> {
    const changes: BotChanges = {};
    if (input.displayName !== undefined) changes.displayName = input.displayName;
    if (input.description !== undefined) changes.description = input.description;
    if (input.ipAllowlist !== undefined) changes.ipAllowlist = normaliseIpAllowlist(input.ipAllowlist);
    if (input.rateLimitPerMinute !== undefined) changes.rateLimitPerMinute = input.rateLimitPerMinute;

    const fields = Object.keys(changes);
    if (fields.length === 0) {
      await findManageableBot(this.db, organisationId, botId);
      return;
    }

    const [updated] = await this.db
      .update(schema.bots)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(this.ownedBy(organisationId, botId), inArray(schema.bots.status, MANAGEABLE_BOT_STATUSES), this.organisationIsActive()))
      .returning();
    if (!updated) return this.throwUnavailable(organisationId, botId);

    await this.record(actor, updated, 'bot.updated', { fields, ipAllowlist: changes.ipAllowlist, rateLimitPerMinute: changes.rateLimitPerMinute });
    this.logger.info('updated organisation bot', { organisationId: organisationId.toString(), botId: botId.toString(), fields });
  }

  async suspendBot(actor: BotActor, organisationId: bigint, botId: bigint): Promise<void> {
    const now = new Date();
    const suspended = await this.transition(organisationId, botId, 'ACTIVE', { status: 'SUSPENDED', suspendedAt: now, suspendedBy: actor.userId, updatedAt: now }, false, false);
    await this.policyDecisionService.invalidatePrincipal({ type: 'SERVICE_ACCOUNT', id: suspended.clientId });
    await this.record(actor, suspended, 'bot.suspended');
    this.logger.info('suspended organisation bot', { organisationId: organisationId.toString(), botId: botId.toString() });
  }

  async resumeBot(actor: BotActor, organisationId: bigint, botId: bigint): Promise<void> {
    const resumed = await this.transition(organisationId, botId, 'SUSPENDED', { status: 'ACTIVE', suspendedAt: null, suspendedBy: null, updatedAt: new Date() }, true, true);
    await this.policyDecisionService.invalidatePrincipal({ type: 'SERVICE_ACCOUNT', id: resumed.clientId });
    await this.record(actor, resumed, 'bot.resumed');
    this.logger.info('resumed organisation bot', { organisationId: organisationId.toString(), botId: botId.toString() });
  }

  /** Recipients ride this admin-only response rather than the member list every member and members-read bot can call, which must not carry a global account signal. */
  async getOwnership(organisationId: bigint, botId: bigint): Promise<BotOwnershipView> {
    const bot = await this.requireBot(organisationId, botId);
    const [ownership, recipients] = await Promise.all([this.botOwnershipService.collect(bot.id), this.listRecipients(organisationId)]);
    return { ...ownership, recipients };
  }

  /**
   * Suspension is immediate and local; the handover is not. Keys are revoked and the bot is put into
   * `DELETING` here, and the worker only flips it to `DELETED` once every bot-aware application has
   * confirmed the transfer. The row survives as a tombstone, so the handle stays reserved.
   */
  async requestDeletion(actor: BotActor, organisationId: bigint, botId: bigint, input: DeleteBot): Promise<void> {
    const bot = await findManageableBot(this.db, organisationId, botId);
    if (input.confirmHandle !== bot.handle) throw new ValidationError('confirmHandle', ERROR_MESSAGES.MISMATCHED_BOT_HANDLE);
    await this.assertActiveMember(organisationId, input.transferToUserId);

    const now = new Date();

    const outcome = await this.db.transaction(async tx => {
      const [locked] = await tx.select({ id: schema.bots.id, status: schema.bots.status }).from(schema.bots).where(this.ownedBy(organisationId, botId)).for('no key update');
      if (!locked || !MANAGEABLE_BOT_STATUSES.includes(locked.status)) return null;

      /** Read under the same transaction as the enqueue: an application registered in the gap would otherwise never receive a row, and the bot would complete owning records there. */
      const applications = await this.botOwnershipService.listBotAwareApplications(tx);

      const revoked = await tx
        .update(schema.botKeys)
        .set({ revokedAt: now, revokedBy: actor.userId })
        .where(and(eq(schema.botKeys.botId, bot.id), isNull(schema.botKeys.revokedAt)))
        .returning({ id: schema.botKeys.id });

      const enqueued = await this.botOwnershipService.enqueue(tx, bot.id, input.transferToUserId, applications);
      const terminal = applications.length === 0;
      await tx
        .update(schema.bots)
        .set({ status: terminal ? 'DELETED' : 'DELETING', deletedAt: terminal ? now : null, updatedAt: now })
        .where(eq(schema.bots.id, bot.id));
      await tx.update(schema.oauthClients).set({ isActive: false, updatedAt: now }).where(eq(schema.oauthClients.id, bot.clientId));
      return { revoked: revoked.length, enqueued, terminal, applications: applications.map(application => application.name) };
    });
    if (!outcome) return this.throwUnavailable(organisationId, botId);

    await this.policyDecisionService.invalidatePrincipal({ type: 'SERVICE_ACCOUNT', id: bot.clientId });
    await this.record(actor, bot, 'bot.deletion.requested', {
      handle: bot.handle,
      transferToUserId: input.transferToUserId.toString(),
      revokedKeys: outcome.revoked,
      applications: outcome.applications,
    });
    if (outcome.terminal) await this.record(actor, bot, 'bot.deleted', { handle: bot.handle, clientId: bot.clientId });
    this.logger.info('requested organisation bot deletion', {
      organisationId: organisationId.toString(),
      botId: botId.toString(),
      transfers: outcome.enqueued,
      revokedKeys: outcome.revoked,
      completed: outcome.terminal,
    });
  }

  /** Returns how many transfers were handed back, so the caller can say whether anything actually moved rather than reporting a no-op as success. */
  async retryTransfers(actor: BotActor, organisationId: bigint, botId: bigint): Promise<number> {
    const bot = await this.requireBot(organisationId, botId);
    if (bot.status !== 'DELETING') throw AppErrorCode.BOT_010.create();

    const retried = await this.botOwnershipService.retryExhausted(bot.id);
    if (retried > 0) await this.record(actor, bot, 'bot.deletion.requested', { handle: bot.handle, retriedTransfers: retried });
    return retried;
  }

  requireBot(organisationId: bigint, botId: bigint): Promise<Bot> {
    return findBot(this.db, organisationId, botId);
  }

  userRefResolver(userIds: (bigint | null)[]): Promise<BotUserRefLookup> {
    return resolveUserRefs(this.db, userIds);
  }

  record(actor: BotActor, bot: Pick<Bot, 'id' | 'organisationId'>, action: string, detail?: Record<string, unknown>): Promise<unknown> {
    return this.auditService.record({
      action,
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: actor.userId.toString(),
      organisationId: bot.organisationId.toString(),
      targetType: 'bot',
      targetId: bot.id.toString(),
      ipAddress: actor.ip ?? null,
      detail: detail ?? null,
    });
  }

  /**
   * The account is checked alongside the membership: a soft-deleted user keeps an ACTIVE membership
   * row by design, and handing an anonymised account every record a bot owns cannot be undone.
   * `listRecipients` answers the same predicate, so the picker can never offer a recipient this
   * refuses.
   */
  private async assertActiveMember(organisationId: bigint, userId: bigint): Promise<void> {
    const [member] = await this.db
      .select({ userId: schema.organisationMembers.userId })
      .from(schema.organisationMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.organisationMembers.userId))
      .where(and(this.recipientEligible(organisationId), eq(schema.organisationMembers.userId, userId)));
    if (!member) throw AppErrorCode.BOT_008.create();
  }

  /**
   * An allow-list rather than `status = 'ACTIVE'`: `users.status` defaults to `INACTIVE`, so a future
   * creation path that omits it would otherwise produce a member who reads ACTIVE in the organisation
   * and is silently un-pickable here. Widening the list is a deliberate edit, not an accident.
   */
  private recipientEligible(organisationId: bigint) {
    return and(
      eq(schema.organisationMembers.organisationId, organisationId),
      eq(schema.organisationMembers.status, 'ACTIVE'),
      inArray(schema.users.status, RECIPIENT_ELIGIBLE_ACCOUNT_STATUSES),
    );
  }

  private async listRecipients(organisationId: bigint): Promise<BotTransferRecipient[]> {
    const rows = await this.db
      .select({ userId: schema.organisationMembers.userId, role: schema.organisationMembers.role })
      .from(schema.organisationMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.organisationMembers.userId))
      .where(this.recipientEligible(organisationId))
      .orderBy(asc(schema.organisationMembers.userId));
    if (rows.length === 0) return [];

    const userRef = await this.userRefResolver(rows.map(row => row.userId));
    const emails = await this.db.query.userEmails.findMany({
      where: and(
        inArray(
          schema.userEmails.userId,
          rows.map(row => row.userId),
        ),
        isNotNull(schema.userEmails.verifiedAt),
      ),
    });
    const primary = new Map<bigint, string>();
    for (const email of emails) {
      if (email.isPrimary || !primary.has(email.userId)) primary.set(email.userId, email.emailId);
    }

    return rows.map(row => ({ userId: row.userId, role: row.role, displayName: userRef(row.userId)?.displayName ?? null, email: primary.get(row.userId) ?? null }));
  }

  private ownedBy(organisationId: bigint, botId: bigint) {
    return and(eq(schema.bots.id, botId), eq(schema.bots.organisationId, organisationId));
  }

  private organisationIsActive() {
    const activeOrganisation = this.db
      .select({ id: schema.organisations.id })
      .from(schema.organisations)
      .where(and(eq(schema.organisations.id, schema.bots.organisationId), eq(schema.organisations.status, 'ACTIVE')));
    return exists(activeOrganisation);
  }

  private async throwUnavailable(organisationId: bigint, botId: bigint, from?: Bot.Status): Promise<never> {
    const bot = await this.requireBot(organisationId, botId);
    const statusAllows = from === undefined ? MANAGEABLE_BOT_STATUSES.includes(bot.status) : bot.status === from;
    if (statusAllows) await assertOrganisationActive(this.db, organisationId);
    throw AppErrorCode.BOT_010.create();
  }

  private async transition(organisationId: bigint, botId: bigint, from: Bot.Status, set: Partial<Bot>, clientActive: boolean, requireActiveOrganisation: boolean): Promise<Bot> {
    const bot = await this.db.transaction(async tx => {
      const [updated] = await tx
        .update(schema.bots)
        .set(set)
        .where(and(this.ownedBy(organisationId, botId), eq(schema.bots.status, from), requireActiveOrganisation ? this.organisationIsActive() : undefined))
        .returning();
      if (!updated) return null;
      await tx.update(schema.oauthClients).set({ isActive: clientActive, updatedAt: new Date() }).where(eq(schema.oauthClients.id, updated.clientId));
      return updated;
    });
    return bot ?? this.throwUnavailable(organisationId, botId, from);
  }

  private async summarise(bots: Bot[]): Promise<BotSummary[]> {
    if (bots.length === 0) return [];
    const stats = await this.keyStats(bots.map(bot => bot.id));
    const deleting = bots.filter(bot => bot.status === 'DELETING');
    const progress = await this.botOwnershipService.progressFor(deleting.map(bot => bot.id));
    const userRef = await this.userRefResolver([...bots.flatMap(bot => [bot.createdBy, bot.suspendedBy]), ...[...progress.values()].map(entry => entry.transferTo)]);

    return bots.map(bot => ({
      id: bot.id,
      clientId: bot.clientId,
      handle: bot.handle,
      displayName: bot.displayName,
      description: bot.description,
      status: bot.status,
      ipAllowlist: bot.ipAllowlist,
      rateLimitPerMinute: bot.rateLimitPerMinute,
      ...(stats.get(bot.id) ?? EMPTY_KEY_STATS),
      createdBy: userRef(bot.createdBy),
      createdAt: bot.createdAt,
      updatedAt: bot.updatedAt,
      suspendedAt: bot.suspendedAt,
      suspendedBy: userRef(bot.suspendedBy),
      deletion: this.deletionSummary(progress.get(bot.id), userRef),
    }));
  }

  private deletionSummary(progress: BotDeletionProgress | undefined, userRef: BotUserRefLookup): BotDeletionSummary | null {
    if (!progress) return null;
    const { transferTo, ...rest } = progress;
    return { ...rest, transferTo: userRef(transferTo) };
  }

  private async keyStats(botIds: bigint[]): Promise<Map<bigint, KeyStats>> {
    const rows = await this.db
      .select({
        botId: schema.botKeys.botId,
        activeKeyCount: sql<number>`count(*) FILTER (WHERE ${schema.botKeys.revokedAt} IS NULL AND ${schema.botKeys.expiresAt} > now())`.mapWith(Number),
        lastUsedAt: sql<Date | null>`max(${schema.botKeys.lastUsedAt})`.mapWith(schema.botKeys.lastUsedAt),
        lastUsedIp: sql<string | null>`(array_agg(host(${schema.botKeys.lastUsedIp}) ORDER BY ${schema.botKeys.lastUsedAt} DESC NULLS LAST))[1]`,
        nextKeyExpiresAt: sql<Date | null>`min(${schema.botKeys.expiresAt}) FILTER (WHERE ${schema.botKeys.revokedAt} IS NULL AND ${schema.botKeys.expiresAt} > now())`.mapWith(
          schema.botKeys.expiresAt,
        ),
      })
      .from(schema.botKeys)
      .where(inArray(schema.botKeys.botId, botIds))
      .groupBy(schema.botKeys.botId);
    return new Map(rows.map(({ botId, ...stats }) => [botId, stats]));
  }
}
