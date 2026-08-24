/**
 * Importing npm packages
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type DatabaseTransaction, schema, type Weight } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class WeightRepository extends OwnerScopedRepository {
  findForDate(tx: DatabaseTransaction, date: string): Promise<Weight.Row | null> {
    const accountId = this.requireAccountId();
    return tx
      .select()
      .from(schema.weights)
      .where(and(eq(schema.weights.accountId, accountId), eq(schema.weights.date, date)))
      .for('update')
      .then(rows => rows[0] ?? null);
  }

  async create(tx: DatabaseTransaction, date: string, kg: string, rewarded: boolean): Promise<Weight.Row> {
    const accountId = this.requireAccountId();
    const [entry] = await tx.insert(schema.weights).values({ accountId, date, kg, rewarded }).returning();
    if (!entry) throw AppError.internal('weight insert returned no row');
    return entry;
  }

  async replace(tx: DatabaseTransaction, date: string, kg: string): Promise<Weight.Row | null> {
    const [entry] = (await this.using(tx).update(schema.weights, { kg, loggedAt: new Date() }, eq(schema.weights.date, date)).returning()) as Weight.Row[];
    return entry ?? null;
  }

  /** Count of canonical days logged in `[from, to]` (inclusive, ISO dates) — the PRD §4.13 monthly cap's input. */
  async countInRange(tx: DatabaseTransaction, from: string, to: string): Promise<number> {
    const accountId = this.requireAccountId();
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(schema.weights)
      .where(and(eq(schema.weights.accountId, accountId), gte(schema.weights.date, from), lte(schema.weights.date, to)));
    return Number(row?.count ?? 0);
  }
}
