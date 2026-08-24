import { type InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, timestamp } from 'drizzle-orm/pg-core';

import { accounts } from './accounts';
import { jsonb } from './jsonb';

export namespace ProgressCountersRow {
  export type Row = InferSelectModel<typeof progressCounters>;
}

/**
 * The incremental projection ARCHITECTURE §26 calls for: one row per account, holding exactly the
 * Achievement/Title counters that are not already mirrored on `accounts` (xp/level/stats live there
 * and are read from there instead of duplicated here). `counters` is jsonb rather than columns because
 * its shape is `rules/progress.ts -> ProgressCounters` minus the account-mirrored fields — a type this
 * table has no independent reason to also express relationally (ARCHITECTURE §10.3 jsonb-justification
 * convention).
 */
export const progressCounters = pgTable('progress_counters', {
  accountId: bigint('account_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  counters: jsonb('counters').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
