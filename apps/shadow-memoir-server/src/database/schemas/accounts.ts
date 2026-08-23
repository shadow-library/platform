import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, char, check, date, integer, pgEnum, pgTable, smallint, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { jsonb } from './jsonb';

export namespace Account {
  export type Row = InferSelectModel<typeof accounts>;
  export type AuthProvider = InferEnum<typeof authProvider>;
  export type Theme = InferEnum<typeof theme>;
  export type IntensityMode = InferEnum<typeof intensityMode>;
  export type WarmthState = InferEnum<typeof warmthState>;
  export type DeletionState = InferEnum<typeof deletionState>;
}

export const authProvider = pgEnum('auth_provider', ['google', 'apple']);
export const theme = pgEnum('theme', ['system', 'light', 'dark']);
export const intensityMode = pgEnum('intensity_mode', ['standard', 'low_intensity', 'high_intensity']);
export const warmthState = pgEnum('warmth_state', ['cold', 'steady', 'warm']);
export const deletionState = pgEnum('deletion_state', ['none', 'pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done']);

export const accounts = pgTable(
  'accounts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    identitySub: varchar('identity_sub', { length: 128 }).notNull(),
    email: varchar('email', { length: 320 }),
    displayName: varchar('display_name', { length: 200 }),
    photoUrl: text('photo_url'),
    authProvider: authProvider('auth_provider').notNull(),
    defaultCurrency: char('default_currency', { length: 3 }).notNull(),
    enabledCurrencies: char('enabled_currencies', { length: 3 }).array().notNull(),
    timezone: text('timezone').notNull(),
    scheduleStartMin: smallint('schedule_start_min').notNull().default(360),
    scheduleEndMin: smallint('schedule_end_min').notNull().default(1380),
    theme: theme('theme').notNull().default('system'),
    weekStart: smallint('week_start').notNull().default(1),
    intensityMode: intensityMode('intensity_mode').notNull().default('standard'),
    returnerThresholdDays: integer('returner_threshold_days').notNull().default(7),

    level: integer('level').notNull().default(1),
    totalXp: bigint('total_xp', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    coins: integer('coins').notNull().default(0),
    statDiscipline: integer('stat_discipline').notNull().default(0),
    statBody: integer('stat_body').notNull().default(0),
    statWealth: integer('stat_wealth').notNull().default(0),
    statMind: integer('stat_mind').notNull().default(0),
    hpToday: smallint('hp_today').notNull().default(0),
    hpStartToday: smallint('hp_start_today').notNull().default(0),
    hpMax: smallint('hp_max').notNull().default(0),
    lastHpDate: date('last_hp_date'),
    lastActiveDate: date('last_active_date'),
    capacityBaseline: smallint('capacity_baseline'),
    warmthState: warmthState('warmth_state').notNull().default('cold'),
    crownPeriodStart: date('crown_period_start'),
    crownRemaining: integer('crown_remaining'),
    crownCoinsRemaining: integer('crown_coins_remaining'),
    displayedTitleId: varchar('displayed_title_id', { length: 64 }),

    featureFlags: jsonb('feature_flags').notNull().default({}),
    ocrQuotaDate: date('ocr_quota_date'),
    ocrQuotaCount: smallint('ocr_quota_count').notNull().default(0),
    notificationPrefs: jsonb('notification_prefs').notNull().default({}),

    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    deletionState: deletionState('deletion_state').notNull().default('none'),
    deletionStartedAt: timestamp('deletion_started_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('accounts_identity_sub_unique').on(t.identitySub),
    check('accounts_level_check', sql`${t.level} >= 1`),
    check('accounts_total_xp_check', sql`${t.totalXp} >= 0`),
    check('accounts_coins_check', sql`${t.coins} >= 0`),
    check('accounts_stat_discipline_check', sql`${t.statDiscipline} >= 0`),
    check('accounts_stat_body_check', sql`${t.statBody} >= 0`),
    check('accounts_stat_wealth_check', sql`${t.statWealth} >= 0`),
    check('accounts_stat_mind_check', sql`${t.statMind} >= 0`),
    check('accounts_ocr_quota_count_check', sql`${t.ocrQuotaCount} >= 0`),
    check('accounts_schedule_start_min_check', sql`${t.scheduleStartMin} BETWEEN 0 AND 1439`),
    check('accounts_schedule_end_min_check', sql`${t.scheduleEndMin} BETWEEN 0 AND 1439`),
    check('accounts_week_start_check', sql`${t.weekStart} BETWEEN 0 AND 6`),
  ],
);

sensitive(accounts.email, 'sensitive');
sensitive(accounts.displayName, 'sensitive');
