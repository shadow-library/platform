import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace ExpenseCategory {
  export type Row = InferSelectModel<typeof expenseCategories>;
}

export namespace Expense {
  export type Row = InferSelectModel<typeof expenses>;
  export type Source = InferEnum<typeof expenseSource>;
}

export namespace Subscription {
  export type Row = InferSelectModel<typeof subscriptions>;
  export type Frequency = InferEnum<typeof subscriptionFrequency>;
  export type ReminderLead = InferEnum<typeof reminderLead>;
}

export namespace FxRate {
  export type Row = InferSelectModel<typeof fxRates>;
}

export const expenseSource = pgEnum('expense_source', ['manual', 'ocr']);
export const subscriptionFrequency = pgEnum('subscription_frequency', ['weekly', 'monthly', 'quarterly', 'yearly', 'custom']);
export const reminderLead = pgEnum('reminder_lead', ['on_day', '1_day', '2_day', '3_day', '1_week']);

/** [Recommendation resolving ARCHITECTURE §10.3 O-5] user-scoped rows seeded from the 9 PRD §2.5 built-ins on first finance touch, not a code constant. */
export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 32 }).notNull(),
    label: varchar('label', { length: 64 }).notNull(),
    builtin: boolean('builtin').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('expense_categories_account_id_key_unique').on(t.accountId, t.key)],
);

/** Due state (`none`/`upcoming`/`due`/`overdue`) is derived at read time from `nextDueDate`/`lastConfirmedDate`, never stored (PRD §3.7). */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    note: text('note'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    amountText: varchar('amount_text', { length: 40 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    frequency: subscriptionFrequency('frequency').notNull(),
    /** Only meaningful for `frequency = 'custom'`; a fixed-day cadence measured from `nextDueDate`. */
    customIntervalDays: smallint('custom_interval_days'),
    billingDay: smallint('billing_day').notNull(),
    nextDueDate: date('next_due_date').notNull(),
    lastConfirmedDate: date('last_confirmed_date'),
    categoryId: varchar('category_id', { length: 32 }).notNull(),
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderLead: reminderLead('reminder_lead').notNull().default('on_day'),
    monthlyEquivalentMinor: bigint('monthly_equivalent_minor', { mode: 'bigint' }).notNull(),
    active: boolean('active').notNull().default(true),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('subscriptions_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    index('subscriptions_account_id_active_idx').on(t.accountId, t.active),
    check('subscriptions_billing_day_check', sql`${t.billingDay} BETWEEN 1 AND 31`),
  ],
);

/** Client-generated UUIDv7 PK (ARCHITECTURE §12.4) — one of the entity classes the client mints ids for, so an offline-created expense already carries its permanent identity. */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    amountText: varchar('amount_text', { length: 40 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /** Locked permanently once set (ARCHITECTURE §14.1); null means the reconciliation sweep has not resolved it yet. Enforced in the command layer — edits never touch a non-null value. */
    fxRate: numeric('fx_rate', { precision: 18, scale: 8 }),
    homeAmountMinor: bigint('home_amount_minor', { mode: 'bigint' }),
    fxRateDate: date('fx_rate_date'),
    categoryId: varchar('category_id', { length: 32 }).notNull(),
    merchant: varchar('merchant', { length: 200 }),
    note: text('note'),
    receiptRef: varchar('receipt_ref', { length: 200 }),
    lineItems: jsonb('line_items'),
    occurredOn: date('occurred_on').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    source: expenseSource('source').notNull().default('manual'),
    linkedQuestId: bigint('linked_quest_id', { mode: 'bigint' }),
    linkedSubscriptionId: bigint('linked_subscription_id', { mode: 'bigint' }).references(() => subscriptions.id),
    billingCycleDate: date('billing_cycle_date'),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('expenses_account_id_linked_subscription_id_billing_cycle_date_unique')
      .on(t.accountId, t.linkedSubscriptionId, t.billingCycleDate)
      .where(sql`${t.linkedSubscriptionId} IS NOT NULL`),
    index('expenses_account_id_occurred_on_idx').on(t.accountId, t.occurredOn),
    index('expenses_account_id_category_id_occurred_on_idx').on(t.accountId, t.categoryId, t.occurredOn),
    index('expenses_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
  ],
);

/**
 * Not user-owned (ARCHITECTURE §14.1): one shared, date-scoped cache of public FX rates the
 * reconciliation sweep refreshes, never touched through `OwnerScopedRepository`. `rate` is nullable so
 * a fetched-but-unavailable pair can still be recorded as attempted, distinguishing "never asked" from
 * "asked, source had nothing" for the 48h alert.
 */
export const fxRates = pgTable(
  'fx_rates',
  {
    date: date('date').notNull(),
    base: char('base', { length: 3 }).notNull(),
    quote: char('quote', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ name: 'fx_rates_date_base_quote_pk', columns: [t.date, t.base, t.quote] })],
);

sensitive(expenses.merchant, 'sensitive');
sensitive(expenses.note, 'sensitive');
sensitive(subscriptions.note, 'sensitive');
