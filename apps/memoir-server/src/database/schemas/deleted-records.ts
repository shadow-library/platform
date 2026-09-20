import { type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';

export namespace DeletedRecord {
  export type Row = InferSelectModel<typeof deletedRecords>;
}

/** Tombstone rows for deletable syncable entities (ARCHITECTURE §12.2) — written in the deleting transaction, read by the delta-pull cursor. */
export const deletedRecords = pgTable(
  'deleted_records',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tableName: varchar('table_name', { length: 64 }).notNull(),
    recordId: varchar('record_id', { length: 64 }).notNull(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('deleted_records_account_id_sync_seq_idx').on(t.accountId, t.syncSeq)],
);
