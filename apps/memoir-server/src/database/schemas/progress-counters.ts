import { type InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, timestamp } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace ProgressCountersRow {
  export type Row = InferSelectModel<typeof progressCounters>;
}

/**
 * One row per account of the Achievement/Title counters not already mirrored on `accounts` (xp/level/stats live there).
 * `counters` is jsonb because its shape is `rules/progress.ts -> ProgressCounters` minus the account-mirrored fields.
 */
export const progressCounters = pgTable('progress_counters', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  counters: jsonb('counters').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
