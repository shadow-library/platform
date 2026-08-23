import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, index, numeric, pgEnum, pgTable, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts } from './accounts';
import { jsonb } from './jsonb';
import { metrics } from './metrics';

export namespace Quest {
  export type Row = InferSelectModel<typeof quests>;
  export type StatAffinity = InferEnum<typeof statAffinity>;
  export type Strictness = InferEnum<typeof strictness>;
  export type ModuleLink = InferEnum<typeof moduleLink>;
}

export namespace QuestConsequence {
  export type Row = InferSelectModel<typeof questConsequences>;
  export type PartialMode = InferEnum<typeof partialMode>;
}

export const statAffinity = pgEnum('stat_affinity', ['discipline', 'body', 'wealth', 'mind']);
export const strictness = pgEnum('strictness', ['anchor', 'routine', 'goal', 'recovery', 'optional']);
export const moduleLink = pgEnum('module_link', ['journal', 'meal', 'weight']);
export const partialMode = pgEnum('partial_mode', ['scaled', 'actual', 'none']);

export const quests = pgTable(
  'quests',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    notes: text('notes'),
    startTimeMin: smallint('start_time_min'),
    durationMin: smallint('duration_min').notNull(),
    statAffinity: statAffinity('stat_affinity').notNull(),
    strictness: strictness('strictness').notNull(),
    optionalStreakOptIn: boolean('optional_streak_opt_in').notNull().default(false),
    recurrence: jsonb('recurrence').notNull(),
    moduleLink: moduleLink('module_link'),
    reminderEnabled: boolean('reminder_enabled').notNull().default(false),
    reminderLeadMin: smallint('reminder_lead_min').notNull().default(0),
    healthThreshold: jsonb('health_threshold'),
    active: boolean('active').notNull().default(true),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index('quests_account_id_active_idx').on(t.accountId, t.active),
    index('quests_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
    check('quests_start_time_min_check', sql`${t.startTimeMin} BETWEEN 0 AND 1439`),
    check('quests_duration_min_check', sql`${t.durationMin} >= 0`),
    check('quests_reminder_lead_min_check', sql`${t.reminderLeadMin} >= 0`),
  ],
);

export const questConsequences = pgTable(
  'quest_consequences',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    metricId: bigint('metric_id', { mode: 'bigint' })
      .notNull()
      .references(() => metrics.id),
    fullValue: numeric('full_value').notNull(),
    unit: text('unit'),
    partialMode: partialMode('partial_mode').notNull(),
  },
  t => [index('quest_consequences_account_id_quest_id_idx').on(t.accountId, t.questId)],
);

sensitive(quests.name, 'sensitive');
