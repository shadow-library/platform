import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, pgEnum, pgTable, timestamp, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

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
 * One row per account, written only by the billing module. `applied_event_at` is the monotonic apply guard: an out-of-order webhook not later than it never moves the projection.
 * `updated_at` can't be the guard because it also moves on writes that carry no provider event (the lapse sweep).
 */
export const entitlements = pgTable(
  'entitlements',
  {
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
  },
  // Partial so a provider binding lands on at most one account; free accounts keep both columns NULL and are excluded from the index.
  t => [
    uniqueIndex('entitlements_provider_provider_ref_unique')
      .on(t.provider, t.providerRef)
      .where(sql`${t.provider} IS NOT NULL AND ${t.providerRef} IS NOT NULL`),
  ],
);

/**
 * Append-only webhook audit. `provider_event_id` is unique on its own (the replay/idempotency spine); `account_id` stays nullable so an event matching no purchase token
 * is still retained for the reconciliation runbook.
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
