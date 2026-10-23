import { and, asc, eq, gt, type SQL } from 'drizzle-orm';
import { type AnyPgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type Account, type PrimaryDatabase, schema } from '@server/database';

import { type ExportTableEntry } from './export-table-registry';

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
