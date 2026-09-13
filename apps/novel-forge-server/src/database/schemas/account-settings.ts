import { InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, timestamp } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';

interface AccountModelRefData {
  provider: string;
  model: string;
}

// Keyed by model group rather than role: the settings page picks one model per group. Mirrors the wire
// `AccountModelDefaults` in ai.dto — keep the two structurally in sync.
export interface AccountModelDefaultsData {
  writing?: AccountModelRefData;
  planning?: AccountModelRefData;
  review?: AccountModelRefData;
  chat?: AccountModelRefData;
  helper?: AccountModelRefData;
  image?: AccountModelRefData;
  ideation?: AccountModelRefData;
}

export namespace AccountSettings {
  export type Row = InferSelectModel<typeof accountSettings>;
}

/**
 * An identity subject's own defaults, one row each. Resolution reads the row of the project's owner rather than of
 * whoever is signed in, so a background job with no principal routes the same way as the owner's own request.
 */
export const accountSettings = pgTable('account_settings', {
  ownerId: bigint('owner_id', { mode: 'bigint' }).primaryKey(),
  models: jsonb('models').$type<AccountModelDefaultsData>().notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
