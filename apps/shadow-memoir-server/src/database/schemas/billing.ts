import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, pgEnum, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace Entitlement {
  export type Row = InferSelectModel<typeof entitlements>;
  export type Tier = InferEnum<typeof entitlementTier>;
  export type State = InferEnum<typeof entitlementState>;
}

export namespace BillingEvent {
  export type Row = InferSelectModel<typeof billingEvents>;
}

export const entitlementTier = pgEnum('entitlement_tier', ['free', 'paid']);
export const entitlementState = pgEnum('entitlement_state', ['free', 'trial', 'active', 'grace', 'lapsed']);

/**
 * One row per account, written **only** by the billing module under `memoir_billing` (ARCHITECTURE
 * §5.4, §16.2). `applied_event_at` is the monotonic apply guard: an out-of-order webhook whose
 * effective instant is not later than this never moves the projection. §16.2 phrases that guard as
 * `updated_at` vs event time, but `updated_at` also moves on writes that carry no provider event
 * (the lapse sweep), which would let a genuinely newer event be mistaken for a stale one.
 */
export const entitlements = pgTable('entitlements', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  tier: entitlementTier('tier').notNull().default('free'),
  state: entitlementState('state').notNull().default('free'),
  /** End of the paid or trial period the provider last reported; access is evaluated against server time, never a client clock. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** When a dunning grace window closes and the account lapses; null outside grace. */
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
  provider: varchar('provider', { length: 32 }),
  providerRef: varchar('provider_ref', { length: 200 }),
  trialUsed: boolean('trial_used').notNull().default(false),
  appliedEventAt: timestamp('applied_event_at', { withTimezone: true }),
  syncSeq: bigint('sync_seq', { mode: 'bigint' })
    .notNull()
    .default(sql`nextval('sync_seq')`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only webhook audit (ARCHITECTURE §10.3, §10.4). `provider_event_id` is unique on its own —
 * the replay/idempotency spine — and `account_id` stays nullable so an event whose purchase token
 * matches nothing is still retained for the reconciliation runbook rather than dropped.
 */
export const billingEvents = pgTable(
  'billing_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 200 }).notNull(),
    accountId: bigint('account_id', { mode: 'bigint' }).references(() => accounts.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    processed: boolean('processed').notNull().default(false),
    quarantined: boolean('quarantined').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('billing_events_provider_event_id_unique').on(t.providerEventId), index('billing_events_quarantined_received_at_idx').on(t.quarantined, t.receivedAt)],
);
