import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, check, date, index, pgEnum, pgTable, smallint, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { questLogState } from './quest-logs';
import { statAffinity } from './quests';

export namespace HeroEvent {
  export type Row = InferSelectModel<typeof heroEvents>;
  export type Type = InferEnum<typeof heroEventType>;
}

export const heroEventType = pgEnum('hero_event_type', [
  'quest_complete',
  'quest_partial',
  'quest_late',
  'recovery',
  'level_up',
  'achievement_unlock',
  'coin_grant',
  'crown_banked',
  'side_quest',
  'journal',
  'meal',
  'weight',
  'coin_spend',
  'recovery_spawned',
  'recovery_completed',
  'recovery_expired',
  'crown_init',
  'crown_forfeit',
]);

/** `quest_id`/`quest_log_id` are historical references, not foreign keys: an owner may delete a quest log and that deletion must never touch this append-only trail (ARCHITECTURE §10.3). */
export const heroEvents = pgTable(
  'hero_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    dedupeKey: varchar('dedupe_key', { length: 120 }).notNull(),
    type: heroEventType('type').notNull(),
    questId: bigint('quest_id', { mode: 'bigint' }),
    questLogId: bigint('quest_log_id', { mode: 'bigint' }),
    state: questLogState('state'),
    xpDelta: smallint('xp_delta').notNull().default(0),
    coinsDelta: smallint('coins_delta').notNull().default(0),
    statAffinity: statAffinity('stat_affinity'),
    statDelta: smallint('stat_delta').notNull().default(0),
    levelAfter: smallint('level_after'),
    achievementId: varchar('achievement_id', { length: 64 }),
    date: date('date').notNull(),
    note: text('note'),
    rulesetVersion: smallint('ruleset_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('hero_events_account_id_dedupe_key_unique').on(t.accountId, t.dedupeKey),
    index('hero_events_account_id_date_idx').on(t.accountId, t.date),
    index('hero_events_account_id_created_at_idx').on(t.accountId, t.createdAt),
    index('hero_events_account_id_type_idx').on(t.accountId, t.type),
    check('hero_events_xp_delta_check', sql`${t.xpDelta} >= 0`),
    check('hero_events_coins_delta_check', sql`${t.coinsDelta} >= 0 OR ${t.type} = 'coin_spend'`),
  ],
);
