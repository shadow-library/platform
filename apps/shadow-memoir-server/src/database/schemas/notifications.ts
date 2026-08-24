import { type InferEnum, type InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, index, pgEnum, pgTable, smallint, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace NotificationOutbox {
  export type Row = InferSelectModel<typeof notificationOutbox>;
  export type Category = InferEnum<typeof notificationCategory>;
  export type Status = InferEnum<typeof notificationOutboxStatus>;
}

/** T-34's closed category set (ARCHITECTURE §17) — mirrors `NotificationCategory` in the notifications module 1:1; the two are kept in a structural test rather than one deriving the other, since a DB enum cannot import a TS type. */
export const notificationCategory = pgEnum('notification_category', ['ai_result_ready', 'billing_reminder', 'weekly_digest']);
export const notificationOutboxStatus = pgEnum('notification_outbox_status', ['pending', 'sent', 'failed']);

/**
 * T-34's send-side of ARCHITECTURE §17/§4.5: every email a sweep or a hook wants sent lands here first,
 * so a pulse failure never fails the triggering AI completion / sweep — only this row's own retry does.
 * `variables` carries only what the closed T-05 template set accepts (ids/numbers/dates/enum codes,
 * never free text), so the row is never a sensitivity-manifest concern. `dedupe_key` plus the unique
 * constraint is what makes re-enqueuing for the same fact (a result, a billing state+date, a digest
 * week) a no-op rather than a duplicate send.
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
