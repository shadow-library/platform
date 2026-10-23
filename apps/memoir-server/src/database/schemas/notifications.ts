import { type InferEnum, type InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, index, pgEnum, pgTable, smallint, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace NotificationOutbox {
  export type Row = InferSelectModel<typeof notificationOutbox>;
  export type Category = InferEnum<typeof notificationCategory>;
  export type Status = InferEnum<typeof notificationOutboxStatus>;
}

/** Mirrors `NotificationCategory` in the notifications module 1:1; kept in sync by a structural test since a DB enum cannot import a TS type. */
export const notificationCategory = pgEnum('notification_category', ['ai_result_ready', 'billing_reminder', 'weekly_digest']);
export const notificationOutboxStatus = pgEnum('notification_outbox_status', ['pending', 'sent', 'failed']);

/**
 * Every email a sweep or hook wants sent lands here first, so a pulse failure never fails the triggering AI completion or sweep, only this row's own retry.
 * `variables` carries only ids/numbers/dates/enum codes, never free text; the `dedupe_key` unique constraint makes re-enqueuing the same fact a no-op.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    category: notificationCategory('category').notNull(),
    templateKey: varchar('template_key', { length: 64 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    variables: jsonb('variables').notNull().default({}),
    status: notificationOutboxStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: varchar('last_error', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  t => [
    unique('notification_outbox_account_id_category_dedupe_key_unique').on(t.accountId, t.category, t.dedupeKey),
    index('notification_outbox_status_next_attempt_at_idx').on(t.status, t.nextAttemptAt),
  ],
);
