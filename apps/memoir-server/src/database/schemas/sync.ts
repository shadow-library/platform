import { pgSequence } from 'drizzle-orm/pg-core';

/**
 * Global cursor for delta sync (ARCHITECTURE §10.1, §12.2). Every syncable table's `sync_seq` column
 * draws from this one sequence, so a client's `(account_id, sync_seq)` cursor totally orders that
 * account's changes across tables without a per-table watermark.
 *
 * Column-default convention for a syncable table: `bigint('sync_seq', { mode: 'bigint' }).notNull().default(sql\`nextval('sync_seq')\`)`,
 * reassigned on every UPDATE by the repository layer (not by a trigger).
 */
export const syncSeq = pgSequence('sync_seq', { startWith: 1 });
