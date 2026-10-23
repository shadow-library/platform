import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

export interface SyncSeqTable {
  syncSeq: AnyPgColumn;
}

export function nextSyncSeq(): SQL {
  return sql`nextval('sync_seq')`;
}

function isSyncSeqTable(table: object): table is SyncSeqTable {
  return 'syncSeq' in table;
}

/**
 * A row's `sync_seq` only defaults on INSERT, so an UPDATE that doesn't re-stamp it lands behind every cursor already past it and never reaches a client.
 * No trigger does this on purpose: `OwnerScopedRepository.scopedUpdate` is the only sanctioned way to update a user-owned table.
 */
export function syncStamped<T extends Record<string, unknown>>(table: object, values: T): T {
  return isSyncSeqTable(table) ? { ...values, syncSeq: nextSyncSeq() } : values;
}
