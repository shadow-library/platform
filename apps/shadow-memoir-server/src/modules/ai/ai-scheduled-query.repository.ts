/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AiScheduledQuery, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class AiScheduledQueryRepository extends OwnerScopedRepository {
  async find(): Promise<AiScheduledQuery.Row | null> {
    const [row] = await this.scoped(schema.aiScheduledQueries);
    return (row as AiScheduledQuery.Row) ?? null;
  }

  /** `account_id` is the primary key (§10.3: one standing question per account), so the upsert target is the row itself. */
  async upsert(queryText: string, active: boolean): Promise<AiScheduledQuery.Row> {
    const accountId = this.requireAccountId();
    const now = new Date();
    const [row] = await this.db
      .insert(schema.aiScheduledQueries)
      .values({ accountId, queryText, active, updatedAt: now })
      .onConflictDoUpdate({ target: schema.aiScheduledQueries.accountId, set: { queryText, active, updatedAt: now } })
      .returning();
    return row as AiScheduledQuery.Row;
  }

  async remove(): Promise<boolean> {
    const deleted = await this.using(this.db).delete(schema.aiScheduledQueries).returning({ accountId: schema.aiScheduledQueries.accountId });
    return deleted.length > 0;
  }
}
