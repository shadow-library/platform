/**
 * Importing npm packages
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AiTask, type DatabaseTransaction, schema } from '@server/database';

/**
 * Defining types
 */

export interface AiTaskDraft {
  id: string;
  queryText: string;
  kind: AiTask.Kind;
  expectedBy: Date;
  quotaMonth: string | null;
  quotaConsumed: boolean;
}

/**
 * Declaring the constants
 */

@Injectable()
export class AiTaskRepository extends OwnerScopedRepository {
  /** `ON CONFLICT DO NOTHING` on the client-minted id is the whole dedupe mechanism (ARCHITECTURE §15.1) — a resubmitted id returns no row here, and the caller falls back to reading the row the first submission already wrote. */
  async insertPending(tx: DatabaseTransaction, draft: AiTaskDraft): Promise<AiTask.Row | null> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .insert(schema.aiTasks)
      .values({
        id: draft.id,
        accountId,
        queryText: draft.queryText,
        kind: draft.kind,
        expectedBy: draft.expectedBy,
        quotaMonth: draft.quotaMonth,
        quotaConsumed: draft.quotaConsumed,
      })
      .onConflictDoNothing({ target: schema.aiTasks.id })
      .returning();
    return (row as AiTask.Row) ?? null;
  }

  async findByIdInTx(tx: DatabaseTransaction, id: string): Promise<AiTask.Row | null> {
    const [row] = await this.using(tx).scoped(schema.aiTasks, eq(schema.aiTasks.id, id));
    return (row as AiTask.Row) ?? null;
  }

  async findById(id: string): Promise<AiTask.Row | null> {
    const [row] = await this.scoped(schema.aiTasks, eq(schema.aiTasks.id, id));
    return (row as AiTask.Row) ?? null;
  }

  /** The whole cancel-vs-claim race (ARCHITECTURE §15.1): zero rows back means the worker already claimed it — cancel is rejected, the task will complete. */
  async cancelIfPending(tx: DatabaseTransaction, id: string): Promise<AiTask.Row | null> {
    const [row] = await this.using(tx)
      .update(schema.aiTasks, { status: 'cancelled', quotaConsumed: false }, eq(schema.aiTasks.id, id), eq(schema.aiTasks.status, 'pending'))
      .returning();
    return (row as AiTask.Row) ?? null;
  }

  /** Free-tier monthly count (ARCHITECTURE §15.1): consumed ad-hoc tasks stamped with this calendar month. */
  async countConsumedInMonth(tx: DatabaseTransaction, quotaMonth: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTasks)
      .where(and(eq(schema.aiTasks.accountId, accountId), eq(schema.aiTasks.quotaConsumed, true), eq(schema.aiTasks.quotaMonth, quotaMonth)));
    return Number(row?.count ?? 0);
  }

  /** Paid-tier daily soft cap (ARCHITECTURE §15.1, PRD §6.8): consumed ad-hoc tasks submitted since local midnight. */
  async countConsumedSince(tx: DatabaseTransaction, since: Date): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.aiTasks)
      .where(and(eq(schema.aiTasks.accountId, accountId), eq(schema.aiTasks.quotaConsumed, true), gte(schema.aiTasks.submittedAt, since)));
    return Number(row?.count ?? 0);
  }
}
