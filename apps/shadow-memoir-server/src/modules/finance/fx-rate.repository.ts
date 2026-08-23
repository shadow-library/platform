/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type DatabaseTransaction, type FxRate, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * `fx_rates` carries no `account_id` (ARCHITECTURE §14.1: a shared, date-scoped cache, not user-owned
 * data), so this is deliberately not an `OwnerScopedRepository` — the same reasoning as `AccountRepository`.
 */
@Injectable()
export class FxRateRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async find(executor: PrimaryDatabase | DatabaseTransaction, date: string, base: string, quote: string): Promise<FxRate.Row | null> {
    const [row] = await executor
      .select()
      .from(schema.fxRates)
      .where(and(eq(schema.fxRates.date, date), eq(schema.fxRates.base, base), eq(schema.fxRates.quote, quote)));
    return row ?? null;
  }

  async findForEntry(date: string, base: string, quote: string): Promise<FxRate.Row | null> {
    return this.find(this.db, date, base, quote);
  }

  /** Upserts the sweep's freshly fetched rate for today; a re-run before the next hour's tick just re-writes the same value. */
  async upsert(date: string, base: string, quote: string, rate: string | null): Promise<void> {
    await this.db
      .insert(schema.fxRates)
      .values({ date, base, quote, rate, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [schema.fxRates.date, schema.fxRates.base, schema.fxRates.quote], set: { rate, fetchedAt: new Date() } });
  }
}
