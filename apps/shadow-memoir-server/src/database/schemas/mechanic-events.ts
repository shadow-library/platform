import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, date, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts, intensityMode } from './accounts';
import { reasonTag } from './quest-logs';
import { quests } from './quests';

export namespace RescheduleEvent {
  export type Row = InferSelectModel<typeof rescheduleEvents>;
}

export namespace RecoveryQuest {
  export type Row = InferSelectModel<typeof recoveryQuests>;
  export type State = InferEnum<typeof recoveryQuestState>;
}

export namespace ComebackEvent {
  export type Row = InferSelectModel<typeof comebackEvents>;
  export type Kind = InferEnum<typeof comebackEventKind>;
  export type TriggerKind = InferEnum<typeof comebackTriggerKind>;
}

export namespace ReturnerEvent {
  export type Row = InferSelectModel<typeof returnerEvents>;
}

export namespace ShieldConsumption {
  export type Row = InferSelectModel<typeof shieldConsumptions>;
}

export const recoveryQuestState = pgEnum('recovery_quest_state', ['pending', 'completed', 'expired']);
export const comebackEventKind = pgEnum('comeback_event_kind', ['armed', 're_armed', 'fired', 're_fired']);
export const comebackTriggerKind = pgEnum('comeback_trigger_kind', ['anchor_miss_yesterday', 'miss_within_days']);

export const rescheduleEvents = pgTable(
  'reschedule_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    fromMin: smallint('from_min'),
    toMin: smallint('to_min').notNull(),
    reasonTag: reasonTag('reason_tag'),
    reasonNote: varchar('reason_note', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('reschedule_events_account_id_quest_id_date_unique').on(t.accountId, t.questId, t.date),
    index('reschedule_events_account_id_date_idx').on(t.accountId, t.date),
    check('reschedule_events_from_min_check', sql`${t.fromMin} BETWEEN 0 AND 1439`),
    check('reschedule_events_to_min_check', sql`${t.toMin} BETWEEN 0 AND 1439`),
  ],
);

/** `state` is the one mutable column and only while `pending`; `source_quest_name` is a required denormalization so an expired Recovery still reads correctly after the quest is renamed. */
export const recoveryQuests = pgTable(
  'recovery_quests',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    sourceQuestId: bigint('source_quest_id', { mode: 'bigint' }).references(() => quests.id, { onDelete: 'set null' }),
    sourceQuestName: varchar('source_quest_name', { length: 200 }).notNull(),
    triggerLogIds: bigint('trigger_log_ids', { mode: 'bigint' })
      .array()
      .notNull()
      .default(sql`'{}'::bigint[]`),
    state: recoveryQuestState('state').notNull().default('pending'),
    reflectionText: text('reflection_text'),
    isReturnerDay: boolean('is_returner_day').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('recovery_quests_account_id_date_unique').on(t.accountId, t.date), index('recovery_quests_state_expires_at_idx').on(t.state, t.expiresAt)],
);

/** The quest-log references are historical ids, not foreign keys: an owner log deletion must not cascade into this append-only audit (ARCHITECTURE §10.4). */
export const comebackEvents = pgTable(
  'comeback_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    kind: comebackEventKind('kind').notNull(),
    triggerKind: comebackTriggerKind('trigger_kind'),
    sourceQuestLogId: bigint('source_quest_log_id', { mode: 'bigint' }),
    consumedQuestLogId: bigint('consumed_quest_log_id', { mode: 'bigint' }),
    xpBonus: smallint('xp_bonus').notNull().default(0),
    coinBonus: smallint('coin_bonus').notNull().default(0),
    intensityMode: intensityMode('intensity_mode').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('comeback_events_account_id_date_kind_unique').on(t.accountId, t.date, t.kind), index('comeback_events_account_id_date_idx').on(t.accountId, t.date)],
);

export const returnerEvents = pgTable(
  'returner_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    returnDate: date('return_date').notNull(),
    lastActiveDate: date('last_active_date'),
    daysAbsent: integer('days_absent').notNull(),
    shieldTargetQuestId: bigint('shield_target_quest_id', { mode: 'bigint' }).references(() => quests.id, { onDelete: 'set null' }),
    shieldPending: boolean('shield_pending').notNull().default(false),
    intensityMode: intensityMode('intensity_mode').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('returner_events_account_id_date_unique').on(t.accountId, t.date), check('returner_events_days_absent_check', sql`${t.daysAbsent} >= 0`)],
);

export const shieldConsumptions = pgTable(
  'shield_consumptions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questId: bigint('quest_id', { mode: 'bigint' })
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('shield_consumptions_account_id_quest_id_date_unique').on(t.accountId, t.questId, t.date), index('shield_consumptions_account_id_date_idx').on(t.accountId, t.date)],
);

sensitive(rescheduleEvents.reasonNote, 'most-sensitive');
sensitive(recoveryQuests.sourceQuestName, 'sensitive');
sensitive(recoveryQuests.reflectionText, 'most-sensitive');
