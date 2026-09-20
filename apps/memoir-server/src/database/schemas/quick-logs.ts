import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, date, index, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts } from './accounts';
import { statAffinity } from './quests';

export namespace JournalEntry {
  export type Row = InferSelectModel<typeof journalEntries>;
}

export namespace Meal {
  export type Row = InferSelectModel<typeof meals>;
  export type MealType = InferEnum<typeof mealType>;
}

export namespace MealPreset {
  export type Row = InferSelectModel<typeof mealPresets>;
}

export namespace Weight {
  export type Row = InferSelectModel<typeof weights>;
}

export namespace SideQuest {
  export type Row = InferSelectModel<typeof sideQuests>;
}

export const mealType = pgEnum('meal_type', ['cooked', 'ate_out']);

/** Multiple per day (PRD §3.9); `rewarded` marks whichever entry landed the first-of-day grant (ARCHITECTURE §11.1's `journal_{date}` dedupe key). Plaintext by design (PRD §3.13) — client-side encryption would block the Phase 2 AI reader. */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    text: text('text').notNull(),
    mood: smallint('mood'),
    tags: text('tags').array(),
    rewarded: boolean('rewarded').notNull().default(false),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('journal_entries_account_id_date_idx').on(t.accountId, t.date),
    index('journal_entries_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('journal_entries_mood_check', sql`${t.mood} IS NULL OR ${t.mood} BETWEEN 1 AND 5`),
  ],
);

/** `presetId` is a historical reference, not a foreign key (same rationale as `metric_entries.quest_log_id`, ARCHITECTURE §10.3): deleting a preset must never cascade into, or be blocked by, meals already logged from it — the row already carries its own snapshot of the preset's values. */
export const meals = pgTable(
  'meals',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    calories: integer('calories').notNull(),
    mealType: mealType('meal_type').notNull(),
    note: text('note'),
    presetId: bigint('preset_id', { mode: 'bigint' }),
    rewarded: boolean('rewarded').notNull().default(false),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('meals_account_id_date_idx').on(t.accountId, t.date),
    index('meals_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('meals_calories_check', sql`${t.calories} >= 0`),
  ],
);

/** No `sync_seq` (ARCHITECTURE §10.3): a small, closed per-account catalogue, cheaper synced as a snapshot domain than watermarked — mirrors `expense_categories`. */
export const mealPresets = pgTable(
  'meal_presets',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    calories: integer('calories').notNull(),
    mealType: mealType('meal_type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [check('meal_presets_calories_check', sql`${t.calories} >= 0`)],
);

/** PK is the natural key itself (ARCHITECTURE §10.3): one canonical value per day, re-log is an UPDATE the client confirms. */
export const weights = pgTable(
  'weights',
  {
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    kg: numeric('kg', { precision: 5, scale: 2 }).notNull(),
    rewarded: boolean('rewarded').notNull().default(false),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ name: 'weights_account_id_date_pk', columns: [t.accountId, t.date] }), index('weights_account_id_sync_seq_idx').on(t.accountId, t.syncSeq)],
);

/** A record of a completed one-off act, never a plan (PRD §2.6) — no `quest_id`, no recurrence, no streak/Crown/HP/Momentum/Comeback participation. `xp_awarded`/`coins_awarded`/`stat_ticked` are grant snapshots, zero for the 4th+ of a day. */
export const sideQuests = pgTable(
  'side_quests',
  {
    id: uuid('id').primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    statAffinity: statAffinity('stat_affinity'),
    xpAwarded: smallint('xp_awarded').notNull().default(0),
    coinsAwarded: smallint('coins_awarded').notNull().default(0),
    statTicked: smallint('stat_ticked').notNull().default(0),
    rewarded: boolean('rewarded').notNull().default(false),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('side_quests_account_id_date_idx').on(t.accountId, t.date), index('side_quests_account_id_sync_seq_idx').on(t.accountId, t.syncSeq)],
);

sensitive(journalEntries.text, 'most-sensitive');
sensitive(meals.name, 'sensitive');
sensitive(meals.note, 'sensitive');
sensitive(mealPresets.name, 'sensitive');
sensitive(mealPresets.note, 'sensitive');
sensitive(sideQuests.name, 'sensitive');
sensitive(weights.kg, 'health');
