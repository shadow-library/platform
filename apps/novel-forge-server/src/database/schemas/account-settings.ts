import { InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';

import { ownerKind } from './owner';
import { costTier } from './projects';

export namespace AccountSettings {
  export type Row = InferSelectModel<typeof accountSettings>;
}

/**
 * An identity subject's own defaults, one row each. Bots never get a row: they hold no settings page, and their
 * projects start on the platform's default cost tier.
 */
export const accountSettings = pgTable(
  'account_settings',
  {
    ownerKind: ownerKind('owner_kind').notNull().default('user'),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    /** The cost tier a new project starts on when its creation request names none. */
    defaultCostTier: costTier('default_cost_tier').notNull().default('balanced'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.ownerKind, t.ownerId] })],
);
