import { type InferSelectModel } from 'drizzle-orm';
import { integer, numeric, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export namespace Budget {
  export type Counter = InferSelectModel<typeof budgetCounters>;
}

/** `window` is a reserved word in Postgres: Drizzle quotes it, and hand-written SQL must too. */
export const budgetCounters = pgTable(
  'budget_counters',
  {
    app: text('app').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    window: text('window').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    calls: integer('calls').notNull().default(0),
    listCostUsd: numeric('list_cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),
  },
  t => [primaryKey({ name: 'budget_counters_pk', columns: [t.app, t.subjectType, t.subjectId, t.window, t.windowStart] })],
);
