import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, check, date, index, numeric, pgEnum, pgTable, smallint, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts, intensityMode } from './accounts';
import { quests, statAffinity, strictness } from './quests';

export namespace QuestLog {
  export type Row = InferSelectModel<typeof questLogs>;
  export type State = InferEnum<typeof questLogState>;
  export type ReasonTag = InferEnum<typeof reasonTag>;
}

export const questLogState = pgEnum('quest_log_state', ['completed', 'partial', 'skipped', 'missed', 'late', 'postponed', 'rescheduled', 'recovery']);

export const reasonTag = pgEnum('reason_tag', [
  'forgot',
  'too_tired',
  'task_too_big',
  'schedule_conflict',
  'avoided_it',
  'emotional_resistance',
  'health',
  'travel',
  'family_social',
  'work_emergency',
  'not_important_anymore',
  'poorly_planned',
  'other',
]);

/**
 * `updated_at` is the 7-day edit window's reference point alongside `created_at`; the window itself is
 * temporal and therefore command-layer enforced, not constraint-enforced (ARCHITECTURE §5.5).
 */
export const questLogs = pgTable(
  'quest_logs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    state: questLogState('state').notNull(),
    xpAwarded: smallint('xp_awarded').notNull().default(0),
    coinsAwarded: smallint('coins_awarded').notNull().default(0),

    statAffinity: statAffinity('stat_affinity').notNull(),
    strictness: strictness('strictness').notNull(),
    intensityModeAtLog: intensityMode('intensity_mode_at_log').notNull(),
    crownSliceWeight: numeric('crown_slice_weight', { precision: 4, scale: 2 }).notNull(),
    rulesetVersion: smallint('ruleset_version').notNull(),

    reasonTag: reasonTag('reason_tag'),
    reasonNote: varchar('reason_note', { length: 120 }),
    reflectionText: text('reflection_text'),
    rescheduledToMin: smallint('rescheduled_to_min'),
    postponedToDate: date('postponed_to_date'),
    performedAt: timestamp('performed_at', { withTimezone: true }),

    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('quest_logs_account_id_quest_id_date_unique').on(t.accountId, t.questId, t.date),
    index('quest_logs_account_id_date_idx').on(t.accountId, t.date),
    index('quest_logs_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('quest_logs_xp_awarded_check', sql`${t.xpAwarded} >= 0`),
    check('quest_logs_coins_awarded_check', sql`${t.coinsAwarded} >= 0`),
    check('quest_logs_rescheduled_to_min_check', sql`${t.rescheduledToMin} BETWEEN 0 AND 1439`),
  ],
);

sensitive(questLogs.reasonNote, 'most-sensitive');
sensitive(questLogs.reflectionText, 'most-sensitive');
