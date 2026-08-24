/**
 * Importing npm packages
 */
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type AiConsent, type AiResult, type AiTask, type AiTaskAudit, nextSyncSeq, RolePoolService, schema } from '@server/database';

import { type ConsentSnapshot } from './ai-worker.types';

/**
 * Defining types
 */

export interface ExecutionAccount {
  id: bigint;
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

/**
 * Declaring the constants
 */

const NO_CONSENT: ConsentSnapshot = { journal_reflection_reason: false, health: false };

/**
 * The batch executor's own data access, on the dedicated `memoir_ai` pool (ARCHITECTURE §5.4, §15.2) —
 * the same shape as `BillingRepository`, and deliberately not an `OwnerScopedRepository`: a sweep has no
 * request account to scope to, it discovers one from the task row it claimed. Every write here is one
 * the grant matrix already permits; a mistaken write anywhere else in this module is refused by
 * Postgres with SQLSTATE 42501 rather than by convention.
 */
@Injectable()
export class AiWorkerRepository {
  constructor(private readonly rolePools: RolePoolService) {}

  /** A method, not a getter, for the reason `BillingRepository.db()` is one: DI walks instance properties at init and a getter would open the pool on every replica. */
  private db(): ReturnType<RolePoolService['getPool']> {
    return this.rolePools.getPool('memoir_ai');
  }

  /**
   * ARCHITECTURE §15.2 verbatim: the claimed id comes from a `FOR UPDATE SKIP LOCKED LIMIT 1`
   * sub-select, so two loops racing the same backlog each take a different row and neither blocks —
   * multi-replica safe by construction, which is what makes the ADR-0002 worker split a deployment
   * change rather than a rewrite. `retriesOnly` is the off-window poll: a task that has been claimed
   * before carries `claimed_at`, so a requeued attempt is distinguishable from a fresh submission
   * without a column that says so.
   */
  async claimNext(workerId: string, retriesOnly = false): Promise<AiTask.Row | null> {
    const retryFilter = retriesOnly ? sql` AND claimed_at IS NOT NULL` : sql``;
    const candidate = sql`(SELECT id FROM ai_tasks WHERE status = 'pending' AND submitted_at <= now()${retryFilter} ORDER BY submitted_at FOR UPDATE SKIP LOCKED LIMIT 1)`;
    const [row] = await this.db()
      .update(schema.aiTasks)
      .set({ status: 'running', claimedBy: workerId, claimedAt: new Date(), syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, candidate))
      .returning();
    return (row as AiTask.Row) ?? null;
  }

  async findAccount(accountId: bigint): Promise<ExecutionAccount | null> {
    const [row] = await this.db()
      .select({
        id: schema.accounts.id,
        timezone: schema.accounts.timezone,
        intensityMode: schema.accounts.intensityMode,
        deletionState: schema.accounts.deletionState,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    return row ?? null;
  }

  /** The §15.3 consent snapshot: state as of now, so a class withdrawn since submission is already false here. */
  async consentSnapshot(accountId: bigint): Promise<ConsentSnapshot> {
    const rows = await this.db().select().from(schema.aiConsents).where(eq(schema.aiConsents.accountId, accountId));
    return rows.reduce<ConsentSnapshot>((snapshot, row) => ({ ...snapshot, [row.dataClass as AiConsent.DataClass]: row.withdrawnAt === null }), { ...NO_CONSENT });
  }

  /**
   * How many quota-consuming ad-hoc tasks this account already placed in the same quota month at or
   * before this one. It is what decides whether a lapsed account's task still fits inside the free
   * allowance or has to wait for a restore — no column records the tier the task was submitted under,
   * and inventing one would be recording an authorization on a row §15.3 says is only a request.
   */
  async quotaRank(task: AiTask.Row): Promise<number> {
    if (task.quotaMonth === null) return 0;
    const [row] = await this.db()
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTasks)
      .where(
        and(
          eq(schema.aiTasks.accountId, task.accountId),
          eq(schema.aiTasks.quotaMonth, task.quotaMonth),
          eq(schema.aiTasks.quotaConsumed, true),
          eq(schema.aiTasks.kind, 'adhoc'),
          sql`${schema.aiTasks.submittedAt} <= ${task.submittedAt}`,
        ),
      );
    return Number(row?.count ?? 0);
  }

  /** Attempts are counted from the append-only audit trail rather than a counter column: the row that proves a claim happened is the same row that counts it. */
  async attempts(taskId: string): Promise<number> {
    const [row] = await this.db()
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTaskAudit)
      .where(and(eq(schema.aiTaskAudit.taskId, taskId), eq(schema.aiTaskAudit.action, 'claimed')));
    return Number(row?.count ?? 0);
  }

  async recordAudit(accountId: bigint, taskId: string, action: AiTaskAudit.Action, dataClasses?: string[], rowCounts?: Record<string, number>): Promise<void> {
    await this.db()
      .insert(schema.aiTaskAudit)
      .values({ accountId, taskId, action, dataClasses: dataClasses ?? null, rowCounts: rowCounts ?? null });
  }

  /** The §15.4 terminal write: the result row and the status that advertises it commit together, so no client ever sees `done` without a result to read. */
  async completeWithResult(draft: AiResultDraft): Promise<AiResult.Row> {
    return this.db().transaction(async tx => {
      const [result] = await tx.insert(schema.aiResults).values(draft).returning();
      if (!result) throw AppError.internal(`ai_results insert for task '${draft.taskId}' returned no row`);
      await tx.update(schema.aiTasks).set({ status: 'done', finishedAt: new Date(), error: null, syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, draft.taskId));
      return result as AiResult.Row;
    });
  }

  /** PRD §6.8: a failure never costs the user a query, so the refund rides the same statement as the terminal status. */
  async fail(task: AiTask.Row, error: string): Promise<void> {
    await this.db()
      .update(schema.aiTasks)
      .set({ status: 'failed', error, finishedAt: new Date(), quotaConsumed: false, syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, task.id));
    if (task.quotaConsumed) await this.recordAudit(task.accountId, task.id, 'refunded');
  }

  /** §15.3: a deletion-marked account's task is dropped, not executed — and dropping it refunds, because the user never got their answer. */
  async drop(task: AiTask.Row, error: string): Promise<void> {
    await this.db()
      .update(schema.aiTasks)
      .set({ status: 'cancelled', error, finishedAt: new Date(), quotaConsumed: false, syncSeq: nextSyncSeq() })
      .where(eq(schema.aiTasks.id, task.id));
    if (task.quotaConsumed) await this.recordAudit(task.accountId, task.id, 'refunded');
  }

  /** §15.1: held, never silently dropped. `quota_consumed` is left as it stands — the query has not run, so nothing further is consumed, and a refund here would let a restore re-charge it. */
  async hold(taskId: string): Promise<void> {
    await this.db().update(schema.aiTasks).set({ status: 'held_upgrade', claimedBy: null, claimedAt: null, syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, taskId));
  }

  /** `claimed_at` survives a requeue on purpose: it is what marks the row as a retry for the off-window poll. */
  async requeue(taskId: string): Promise<void> {
    await this.db().update(schema.aiTasks).set({ status: 'pending', syncSeq: nextSyncSeq() }).where(eq(schema.aiTasks.id, taskId));
  }

  async listHeld(limit: number): Promise<AiTask.Row[]> {
    return (await this.db().select().from(schema.aiTasks).where(eq(schema.aiTasks.status, 'held_upgrade')).limit(limit)) as AiTask.Row[];
  }

  /** §15.2's crashed-claim recovery: a `running` row whose claim went stale is a worker that died mid-execution, never a slow one — the timeout is longer than any completion. */
  async findStuck(cutoff: Date, limit: number): Promise<AiTask.Row[]> {
    return (await this.db()
      .select()
      .from(schema.aiTasks)
      .where(and(eq(schema.aiTasks.status, 'running'), isNotNull(schema.aiTasks.claimedAt), lt(schema.aiTasks.claimedAt, cutoff)))
      .limit(limit)) as AiTask.Row[];
  }
}
