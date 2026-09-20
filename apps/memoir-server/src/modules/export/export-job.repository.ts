/**
 * Importing npm packages
 */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type ExportJob, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ExportJobRepository extends OwnerScopedRepository {
  async countSince(accountId: bigint, since: Date): Promise<number> {
    const rows = await this.forAccount(accountId).scoped(schema.exportJobs, gte(schema.exportJobs.requestedAt, since));
    return rows.length;
  }

  async create(id: string, accountId: bigint): Promise<ExportJob.Row> {
    const [job] = await this.db.insert(schema.exportJobs).values({ id, accountId }).returning();
    if (!job) throw AppError.internal(`export job insert for account '${accountId}' returned no row`);
    return job;
  }

  async findByIdForAccount(id: string): Promise<ExportJob.Row | null> {
    const [job] = await this.scoped(schema.exportJobs, eq(schema.exportJobs.id, id));
    return (job as ExportJob.Row) ?? null;
  }

  /**
   * The assembler sweep's claim (ARCHITECTURE §20): `FOR UPDATE SKIP LOCKED` lets N replicas each grab a
   * disjoint batch of `pending` jobs concurrently rather than serializing on the row lock, which is what
   * makes this safe ahead of the worker split (ADR-0002) with zero code change later. Marking `running`
   * inside the same transaction that took the lock is what makes a claim exclusive.
   */
  async claimPending(limit: number): Promise<ExportJob.Row[]> {
    return this.db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(schema.exportJobs)
        .where(eq(schema.exportJobs.status, 'pending'))
        .orderBy(asc(schema.exportJobs.requestedAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];

      const ids = rows.map(row => row.id);
      await tx
        .update(schema.exportJobs)
        .set({ status: 'running' })
        .where(and(eq(schema.exportJobs.status, 'pending'), inArray(schema.exportJobs.id, ids)));
      return rows.map(row => ({ ...row, status: 'running' as const }));
    });
  }

  async markDone(id: string, objectKey: string, expiresAt: Date): Promise<void> {
    await this.db.update(schema.exportJobs).set({ status: 'done', objectKey, completedAt: new Date(), expiresAt }).where(eq(schema.exportJobs.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(schema.exportJobs)
      .set({ status: 'failed', error: error.slice(0, 500), completedAt: new Date() })
      .where(eq(schema.exportJobs.id, id));
  }

  /** The 7-day cleanup sweep's candidate set (ARCHITECTURE §20): every `done` job past its `expiresAt`. */
  async findExpired(now: Date, limit: number): Promise<ExportJob.Row[]> {
    return this.db
      .select()
      .from(schema.exportJobs)
      .where(and(eq(schema.exportJobs.status, 'done'), lt(schema.exportJobs.expiresAt, now)))
      .limit(limit);
  }

  async removeUnscoped(id: string): Promise<void> {
    await this.db.delete(schema.exportJobs).where(eq(schema.exportJobs.id, id));
  }
}
