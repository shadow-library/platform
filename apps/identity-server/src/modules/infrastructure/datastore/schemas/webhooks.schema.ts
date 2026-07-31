/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type WebhookSubscription = InferSelectModel<typeof webhookSubscriptions>;
export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>;

export namespace WebhookDelivery {
  export type Status = InferEnum<typeof webhookDeliveryStatus>;
}

/**
 * Declaring the constants
 */

export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', ['PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD']);

/**
 * Platform-tier webhook subscriptions (T-706). Signing secrets are AES-256-GCM envelopes like TOTP
 * seeds; the previous secret stays valid for a rotation overlap window so receivers can migrate
 * without dropping signatures. Event filters hold exact audit action names or `prefix.*` patterns.
 */
export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  targetUrl: text('target_url').notNull(),
  eventTypes: text('event_types').array().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  secretCiphertext: text('secret_ciphertext').notNull(),
  kekVersion: integer('kek_version').notNull(),
  previousSecretCiphertext: text('previous_secret_ciphertext'),
  previousSecretExpiresAt: timestamp('previous_secret_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional delivery outbox mirroring the back-channel logout pipeline: skip-locked claims,
 * exponential backoff, dead-letter after max attempts, crash requeue. `(subscription, event)` is
 * unique so an audit event enqueues at most once per subscription; the pair is the idempotency
 * key receivers deduplicate on.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    subscriptionId: bigint('subscription_id', { mode: 'bigint' })
      .notNull()
      .references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    payload: text('payload').notNull(),
    status: webhookDeliveryStatus('status').notNull().default('PENDING'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: varchar('last_error', { length: 512 }),
    responseStatus: integer('response_status'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('webhook_deliveries_subscription_event_unique').on(t.subscriptionId, t.eventId), index('webhook_deliveries_claim_idx').on(t.status, t.nextAttemptAt)],
);
