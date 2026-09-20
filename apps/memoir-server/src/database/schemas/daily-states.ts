import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';

import { accounts, intensityMode } from './accounts';

export namespace DailyState {
  export type Row = InferSelectModel<typeof dailyStates>;
  export type MomentumBucket = InferEnum<typeof momentumBucket>;
}

export const momentumBucket = pgEnum('momentum_bucket', ['cold', 'steady', 'warm']);

/** `rollover_at` is the terminalization marker: once set the day is closed, and every writer carries `WHERE rollover_at IS NULL` (ARCHITECTURE §10.4). */
export const dailyStates = pgTable(
  'daily_states',
  {
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    intensityMode: intensityMode('intensity_mode').notNull(),

    hpStart: smallint('hp_start').notNull(),
    hpEnd: smallint('hp_end').notNull(),
    hpMax: smallint('hp_max').notNull(),

    crownXpGranted: integer('crown_xp_granted').notNull().default(0),
    crownXpRemaining: integer('crown_xp_remaining').notNull().default(0),
    crownCoinsGranted: integer('crown_coins_granted').notNull().default(0),
    crownCoinsRemaining: integer('crown_coins_remaining').notNull().default(0),
    crownPeriodStart: date('crown_period_start').notNull(),
    crownBankedXp: integer('crown_banked_xp'),
    crownBankedCoins: integer('crown_banked_coins'),

    committedAt: timestamp('committed_at', { withTimezone: true }),
    lockedQuestIds: bigint('locked_quest_ids', { mode: 'bigint' })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
    lockBrokenAt: timestamp('lock_broken_at', { withTimezone: true }),

    comebackArmed: boolean('comeback_armed').notNull().default(false),
    comebackFired: boolean('comeback_fired').notNull().default(false),
    comebackFiredAt: timestamp('comeback_fired_at', { withTimezone: true }),
    comebackArmedViaRecovery: boolean('comeback_armed_via_recovery').notNull().default(false),
    comebackReFired: boolean('comeback_re_fired').notNull().default(false),

    returnerActive: boolean('returner_active').notNull().default(false),
    returnerFired: boolean('returner_fired').notNull().default(false),

    momentumBucket: momentumBucket('momentum_bucket').notNull().default('steady'),
    missedCount: integer('missed_count').notNull().default(0),

    rolloverAt: timestamp('rollover_at', { withTimezone: true }),
    rolloverEngineVersion: text('rollover_engine_version'),
    rulesetVersion: smallint('ruleset_version').notNull(),

    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  t => [
    primaryKey({ name: 'daily_states_account_id_date_pk', columns: [t.accountId, t.date] }),
    index('daily_states_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('daily_states_missed_count_check', sql`${t.missedCount} >= 0`),
  ],
);
