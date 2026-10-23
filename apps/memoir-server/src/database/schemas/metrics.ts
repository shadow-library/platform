import { type InferEnum, type InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, date, index, numeric, pgEnum, pgTable, timestamp, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

import { sensitive } from '../sensitivity';
import { accounts } from './accounts';

export namespace Metric {
  export type Row = InferSelectModel<typeof metrics>;
  export type ValueType = InferEnum<typeof metricValueType>;
  export type Direction = InferEnum<typeof metricDirection>;
}

export namespace MetricEntry {
  export type Row = InferSelectModel<typeof metricEntries>;
  export type Source = InferEnum<typeof metricEntrySource>;
}

export const metricValueType = pgEnum('metric_value_type', ['number', 'duration', 'count', 'currency', 'boolean', 'text']);
export const metricDirection = pgEnum('metric_direction', ['higher', 'lower', 'range', 'neutral']);
export const metricEntrySource = pgEnum('metric_entry_source', ['quest_log', 'manual', 'food']);

/** Built-ins (including the `is_health` set) are seeded per account rather than shared; each account owns its catalogue rows, but `metric.update`/`metric.delete` refuse them. */
export const metrics = pgTable(
  'metrics',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    unit: varchar('unit', { length: 32 }),
    valueType: metricValueType('value_type').notNull(),
    direction: metricDirection('direction').notNull(),
    defaultValue: numeric('default_value'),
    glyph: varchar('glyph', { length: 16 }),
    builtin: boolean('builtin').notNull().default(false),
    /** Drives analytics exclusion and AI-consent gating; set only by built-in seeding, never by `metric.create`. */
    isHealth: boolean('is_health').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('metrics_account_id_name_unique').on(t.accountId, t.name)],
);

/**
 * `quest_log_id` is a historical reference, not a foreign key: deleting a `quest_logs` row must not cascade into, or be blocked by, the metric value it wrote.
 * A real FK would also close an import cycle: `metrics.ts` -> `quest-logs.ts` -> `quests.ts` -> `metrics.ts`.
 */
export const metricEntries = pgTable(
  'metric_entries',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    accountId: bigint('account_id', { mode: 'bigint' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    metricId: bigint('metric_id', { mode: 'bigint' })
      .notNull()
      .references(() => metrics.id),
    date: date('date').notNull(),
    value: numeric('value').notNull(),
    source: metricEntrySource('source').notNull().default('manual'),
    questLogId: bigint('quest_log_id', { mode: 'bigint' }),
    syncSeq: bigint('sync_seq', { mode: 'bigint' })
      .notNull()
      .default(sql`nextval('sync_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('metric_entries_account_id_metric_id_date_source_unique')
      .on(t.accountId, t.metricId, t.date, t.source)
      .where(sql`${t.source} <> 'quest_log'`),
    uniqueIndex('metric_entries_quest_log_id_metric_id_unique')
      .on(t.questLogId, t.metricId)
      .where(sql`${t.questLogId} IS NOT NULL`),
    index('metric_entries_account_id_sync_seq_idx').on(t.accountId, t.syncSeq),
  ],
);

sensitive(metrics.name, 'health');
sensitive(metricEntries.value, 'health');
