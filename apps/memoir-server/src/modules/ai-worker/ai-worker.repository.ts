import { and, eq, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { type AiConsent, type AiResult, type AiTask, type AiTaskAudit, nextSyncSeq, type PrimaryDatabase, schema } from '@server/database';

import { type ConsentSnapshot } from './ai-worker.types';

export interface ExecutionAccount {
  id: bigint;
  identitySub: string;
  timezone: string;
  intensityMode: string;
  deletionState: string;
}

export interface AiResultDraft {
  accountId: bigint;
  taskId: string;
  answer: string;
  patterns: unknown[];
  suggestions: unknown[];
  citations: unknown[];
  limitationNote: string | null;
  modelId: string;
  promptVersion: string;
}

const NO_CONSENT: ConsentSnapshot = { journal_reflection_reason: false, health: false };

/** The batch executor's data access; deliberately not an `OwnerScopedRepository`: a sweep has no request account and discovers one from the task row it claimed. */
@Injectable()
export class AiWorkerRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /**
   * The claimed id comes from a `FOR UPDATE SKIP LOCKED LIMIT 1` sub-select, so racing loops each take a different row and neither blocks (multi-replica safe).
   * `retriesOnly` is the off-window poll: a previously claimed task carries `claimed_at`, which distinguishes a requeue from a fresh submission.
   */
  async claimNext(workerId: string, retriesOnly = false): Promise<AiTask.Row | null> {
    const retryFilter = retriesOnly ? sql` AND claimed_at IS NOT NULL` : sql``;
    const candidate = sql`(SELECT id FROM ai_tasks WHERE status = 'pending' AND submitted_at <= now()${retryFilter} ORDER BY submitted_at FOR UPDATE SKIP LOCKED LIMIT 1)`;
    const [row] = await this.db
      .update(schema.aiTasks)
      .set({ status: 'running', claimedBy: workerId, claimedAt: new Date(), syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, candidate))
      .returning();
    return (row as AiTask.Row) ?? null;
  }

  async findAccount(accountId: bigint): Promise<ExecutionAccount | null> {
    const [row] = await this.db
      .select({
        id: schema.accounts.id,
        identitySub: schema.accounts.identitySub,
        timezone: schema.accounts.timezone,
        intensityMode: schema.accounts.intensityMode,
        deletionState: schema.accounts.deletionState,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    return row ?? null;
  }

  /** Consent snapshot: state as of now, so a class withdrawn since submission is already false here. */
  async consentSnapshot(accountId: bigint): Promise<ConsentSnapshot> {
    const rows = await this.db.select().from(schema.aiConsents).where(eq(schema.aiConsents.accountId, accountId));
    return rows.reduce<ConsentSnapshot>((snapshot, row) => ({ ...snapshot, [row.dataClass as AiConsent.DataClass]: row.withdrawnAt === null }), { ...NO_CONSENT });
  }

  /**
   * Quota-consuming ad-hoc tasks this account placed in the same quota month at or before this one; decides whether a lapsed account's task still fits the free allowance.
   * No column records the submission tier, and adding one would record an authorization on a row that is only a request.
   */
  async quotaRank(task: AiTask.Row): Promise<number> {
    if (task.quotaMonth === null) return 0;
    const [row] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTasks)
      .where(
        and(
          eq(schema.aiTasks.accountId, task.accountId),
          eq(schema.aiTasks.quotaMonth, task.quotaMonth),
          eq(schema.aiTasks.quotaConsumed, true),
          eq(schema.aiTasks.kind, 'adhoc'),
          lte(schema.aiTasks.submittedAt, task.submittedAt),
        ),
      );
    return Number(row?.count ?? 0);
  }

  /** Attempts are counted from the append-only audit trail rather than a counter column: the row that proves a claim happened is the same row that counts it. */
  async attempts(taskId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTaskAudit)
      .where(and(eq(schema.aiTaskAudit.taskId, taskId), eq(schema.aiTaskAudit.action, 'claimed')));
    return Number(row?.count ?? 0);
  }

  async recordAudit(accountId: bigint, taskId: string, action: AiTaskAudit.Action, dataClasses?: string[], rowCounts?: Record<string, number>): Promise<void> {
    await this.db.insert(schema.aiTaskAudit).values({ accountId, taskId, action, dataClasses: dataClasses ?? null, rowCounts: rowCounts ?? null });
  }

  /** The terminal write: the result row and the status that advertises it commit together, so no client ever sees `done` without a result to read. */
  async completeWithResult(draft: AiResultDraft): Promise<AiResult.Row> {
    return this.db.transaction(async tx => {
      const [result] = await tx.insert(schema.aiResults).values(draft).returning();
      if (!result) throw AppError.internal(`ai_results insert for task '${draft.taskId}' returned no row`);
      await tx.update(schema.aiTasks).set({ status: 'done', finishedAt: new Date(), error: null, syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, draft.taskId));
      return result as AiResult.Row;
    });
  }

  /** A failure never costs the user a query, so the refund rides the same statement as the terminal status. */
  async fail(task: AiTask.Row, error: string): Promise<void> {
    await this.db
      .update(schema.aiTasks)
      .set({ status: 'failed', error, finishedAt: new Date(), quotaConsumed: false, syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, task.id));
    if (task.quotaConsumed) await this.recordAudit(task.accountId, task.id, 'refunded');
  }

  /** A deletion-marked account's task is dropped, not executed, and dropping it refunds, because the user never got their answer. */
  async drop(task: AiTask.Row, error: string): Promise<void> {
    await this.db
      .update(schema.aiTasks)
      .set({ status: 'cancelled', error, finishedAt: new Date(), quotaConsumed: false, syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, task.id));
    if (task.quotaConsumed) await this.recordAudit(task.accountId, task.id, 'refunded');
  }

  /**
   * Held, never silently dropped. `quota_consumed` is left as it stands: the query has not run, so nothing further is consumed, and a refund
   * here would let a restore re-charge it.
   */
  async hold(taskId: string): Promise<void> {
    await this.db.update(schema.aiTasks).set({ status: 'held_upgrade', claimedBy: null, claimedAt: null, syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, taskId));
  }

  /** `claimed_at` survives a requeue on purpose: it is what marks the row as a retry for the off-window poll. */
  async requeue(taskId: string): Promise<void> {
    await this.db.update(schema.aiTasks).set({ status: 'pending', syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, taskId));
  }

  async listHeld(limit: number): Promise<AiTask.Row[]> {
    return (await this.db.select().from(schema.aiTasks).where(eq(schema.aiTasks.status, 'held_upgrade')).limit(limit)) as AiTask.Row[];
  }

  /** Crashed-claim recovery: a `running` row whose claim went stale is a worker that died mid-execution, never a slow one, since the timeout is longer than any completion. */
  async findStuck(cutoff: Date, limit: number): Promise<AiTask.Row[]> {
    return (await this.db
      .select()
      .from(schema.aiTasks)
      .where(and(eq(schema.aiTasks.status, 'running'), isNotNull(schema.aiTasks.claimedAt), lt(schema.aiTasks.claimedAt, cutoff)))
      .limit(limit)) as AiTask.Row[];
  }
}
