/**
 * Importing npm packages
 */
import { and, asc, eq, gt, type SQL } from 'drizzle-orm';
import { type AnyPgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Account, type PrimaryDatabase, schema } from '@server/database';

import { type ExportTableEntry } from './export-table-registry';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The export assembler's machine-path reader: like `RolloverRepository`, it deliberately sits outside
 * `OwnerScopedRepository` and takes `accountId` as an explicit argument, because the sweep runs with no
 * request context to resolve one from.
 */
@Injectable()
export class ExportAssemblyRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async findAccountSnapshot(accountId: bigint): Promise<Account.Row | null> {
    const [account] = await this.db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
    return account ?? null;
  }

  /** One bounded page of `entry.table`'s rows for `accountId`, ordered by `entry.cursor` ascending and starting after `cursor` (`null` for the first page). */
  fetchPage(accountId: bigint, entry: ExportTableEntry, cursor: unknown, limit: number): Promise<unknown[]> {
    const conditions: (SQL | undefined)[] = [eq(entry.table.accountId, accountId)];
    if (cursor !== null) conditions.push(gt(entry.cursor, cursor as never));

    return this.db
      .select()
      .from(entry.table as unknown as AnyPgTable)
      .where(and(...conditions))
      .orderBy(asc(entry.cursor))
      .limit(limit);
  }
}
