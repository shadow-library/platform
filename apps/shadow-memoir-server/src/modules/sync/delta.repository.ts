/**
 * Importing npm packages
 */
import { asc, gt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type OwnedTable, OwnerScopedRepository } from '@modules/auth';
import { schema, type SyncSeqTable } from '@server/database';

import { type DeltaRecord, type DeltaRow, type DeltaTombstone } from './sync.types';

/**
 * Defining types
 */

export type SyncableTable = OwnedTable & SyncSeqTable;

/**
 * Declaring the constants
 */

/** Values Postgres hands back that JSON cannot carry; every delta row passes through here before it reaches the wire. */
function toDeltaRow(row: Record<string, unknown>): DeltaRow {
  const serialized: DeltaRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') serialized[key] = String(value);
    else if (value instanceof Date) serialized[key] = value.toISOString();
    else serialized[key] = value;
  }
  return serialized;
}

/**
 * The generic keyset reader every table-backed `DeltaSource` is built on, plus the tombstone stream.
 * Reads go through `scoped()`, so a page can only ever contain the caller's own rows — the cursor is
 * data the client supplies, the account never is.
 */
@Injectable()
export class DeltaRepository extends OwnerScopedRepository {
  async fetchSince(table: SyncableTable, since: bigint, limit: number): Promise<DeltaRecord[]> {
    const rows = await this.scoped(table, gt(table.syncSeq, since)).orderBy(asc(table.syncSeq)).limit(limit);
    return (rows as Record<string, unknown>[]).map(row => ({ syncSeq: row['syncSeq'] as bigint, row: toDeltaRow(row) }));
  }

  async tombstonesSince(since: bigint, limit: number): Promise<DeltaTombstone[]> {
    const rows = await this.scoped(schema.deletedRecords, gt(schema.deletedRecords.syncSeq, since)).orderBy(asc(schema.deletedRecords.syncSeq)).limit(limit);
    return (rows as (typeof schema.deletedRecords.$inferSelect)[]).map(row => ({ domain: row.tableName, recordId: row.recordId, syncSeq: row.syncSeq }));
  }
}
