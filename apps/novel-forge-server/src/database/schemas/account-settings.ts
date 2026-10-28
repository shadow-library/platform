import { InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';

import { ownerKind } from './owner';
import { costTier } from './projects';

export namespace AccountSettings {
  export type Row = InferSelectModel<typeof accountSettings>;
}

/** Emptied and never read: a new project starts on balanced. Kept until a later migration drops it, since a rolling deploy's older pods still read it. */
export const accountSettings = pgTable(
  'account_settings',
  {
    ownerKind: ownerKind('owner_kind').notNull().default('user'),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    defaultCostTier: costTier('default_cost_tier').notNull().default('balanced'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.ownerKind, t.ownerId] })],
);
