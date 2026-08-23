/**
 * Importing npm packages
 */
import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** Any table whose rows carry a `sync_seq` drawn from the global sequence (ARCHITECTURE §10.1). */
export interface SyncSeqTable {
  syncSeq: AnyPgColumn;
}

/**
 * Declaring the constants
 */

export function nextSyncSeq(): SQL {
  return sql`nextval('sync_seq')`;
}

export function isSyncSeqTable(table: object): table is SyncSeqTable {
  return 'syncSeq' in table;
}

/**
 * A row's `sync_seq` only defaults on INSERT, so an UPDATE that did not re-stamp it would mutate the
 * row below every cursor that has already passed it — the change would reach no client, ever. There is
 * deliberately no trigger doing this (ARCHITECTURE §12.2): it belongs to the repository layer, which is
 * why `OwnerScopedRepository.scopedUpdate` is the only sanctioned way to update a user-owned table.
 */
export function syncStamped<T extends Record<string, unknown>>(table: object, values: T): T {
  return isSyncSeqTable(table) ? { ...values, syncSeq: nextSyncSeq() } : values;
}
