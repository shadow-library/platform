import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** One row per scheduler sweep name; a sweep runs only after a conditional update on `last_run_at` claims it, so replicas never double-run one cadence window. */
export const sweepRuns = pgTable('sweep_runs', {
  name: text('name').primaryKey(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull().defaultNow(),
});
