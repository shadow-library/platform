import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';

export namespace Receipt {
  export type Row = InferSelectModel<typeof receipts>;
  export type Status = InferEnum<typeof receiptStatus>;
}

export const receiptStatus = pgEnum('receipt_status', ['pending_upload', 'stored', 'deleted']);

/**
 * PK `ref` is the object key itself (ARCHITECTURE §19.2: `r/{account_id}/{uuidv7}.{ext}`), minted
 * server-side at `POST /receipts` — never client-generated, unlike `expenses.id`. Not a synced table:
 * `expenses.receipt_ref` is the client-visible pointer, delta-synced as part of the expense row.
 */
export const receipts = pgTable(
  'receipts',
  {
    ref: varchar('ref', { length: 200 }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: receiptStatus('status').notNull().default('pending_upload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('receipts_account_id_idx').on(t.accountId),
    /** Drives both orphan sweeps (§19.2): stale `pending_upload` rows by age, ordered by `status`. */
    index('receipts_status_created_at_idx').on(t.status, t.createdAt),
    check('receipts_size_bytes_check', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 8388608`),
  ],
);
