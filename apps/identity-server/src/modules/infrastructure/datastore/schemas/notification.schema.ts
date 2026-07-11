/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigserial, index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type NotificationOutbox = InferSelectModel<typeof notificationOutbox>;

export namespace NotificationOutbox {
  export type Status = InferEnum<typeof notificationStatus>;
  export interface Recipients {
    email?: string;
    phone?: string;
    push?: string;
  }
}

/**
 * Declaring the constants
 */

export const notificationStatus = pgEnum('notification_status', ['PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD']);

/**
 * Transactional outbox for outbound notifications. A domain change and its notification are written
 * in the same transaction; a worker drains the outbox and calls the notification service, so a
 * message is never sent for a change that later rolls back and a provider outage never blocks a
 * request.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    templateKey: varchar('template_key', { length: 128 }).notNull(),
    recipients: jsonb('recipients').notNull().$type<NotificationOutbox.Recipients>(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    status: notificationStatus('status').notNull().default('PENDING'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  t => [index('notification_outbox_status_next_attempt_idx').on(t.status, t.nextAttemptAt)],
);
