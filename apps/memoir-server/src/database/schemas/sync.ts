import { pgSequence } from 'drizzle-orm/pg-core';

/**
 * Global cursor for delta sync: every syncable table's `sync_seq` draws from this one sequence, so a client's `(account_id, sync_seq)` cursor
 * totally orders that account's changes across tables.
 * Column default is `nextval('sync_seq')`, reassigned on every UPDATE by the repository layer, not by a trigger.
 */
export const syncSeq = pgSequence('sync_seq', { startWith: 1 });
