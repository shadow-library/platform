import { type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, check, date, index, integer, pgTable, primaryKey, smallint } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { quests } from './quests';

export namespace QuestStreak {
  export type Row = InferSelectModel<typeof questStreaks>;
}

/** Incremental projection, rebuildable from `quest_logs` + `shield_consumptions` by a pure `rules` function (ARCHITECTURE §26). */
export const questStreaks = pgTable(
  'quest_streaks',
  {
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    currentRunDays: integer('current_run_days').notNull().default(0),
    runStartDate: date('run_start_date'),
    lastCountedDate: date('last_counted_date'),
    shieldsAvailable: smallint('shields_available').notNull().default(0),
    completionsTowardShield: smallint('completions_toward_shield').notNull().default(0),
    bestRunDays: integer('best_run_days').notNull().default(0),
    /** A Returner shield held back because the Quest was already at cap (PRD §4.6); settles into `shields_available` the next time this run holds, bridges, or breaks. */
    pendingShieldGrant: smallint('pending_shield_grant').notNull().default(0),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  t => [
    primaryKey({ name: 'quest_streaks_account_id_quest_id_pk', columns: [t.accountId, t.questId] }),
    index('quest_streaks_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('quest_streaks_shields_available_check', sql`${t.shieldsAvailable} BETWEEN 0 AND 2`),
    check('quest_streaks_current_run_days_check', sql`${t.currentRunDays} >= 0`),
    check('quest_streaks_best_run_days_check', sql`${t.bestRunDays} >= 0`),
    check('quest_streaks_completions_toward_shield_check', sql`${t.completionsTowardShield} >= 0`),
    check('quest_streaks_pending_shield_grant_check', sql`${t.pendingShieldGrant} >= 0`),
  ],
);
