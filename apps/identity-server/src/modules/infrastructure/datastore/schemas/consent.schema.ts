/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { bigint, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { users } from './users.schema';

/**
 * Defining types
 */

export type Consent = InferSelectModel<typeof consents>;

export namespace Consent {
  export type Source = InferEnum<typeof consentSource>;
}

/**
 * Declaring the constants
 */

export const consentSource = pgEnum('consent_source', ['USER', 'FIRST_PARTY_POLICY', 'ADMIN']);

/**
 * Records a user's consent for a client's scopes. First-party clients skip the consent screen but a
 * record is still written (source FIRST_PARTY_POLICY), so enabling third-party consent later needs
 * no data-model change. At most one active (unrevoked) consent exists per user/client pair.
 */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    scopeNames: text('scope_names').array().notNull(),
    source: consentSource('source').notNull(),
    policyVersion: integer('policy_version').notNull().default(1),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  t => [
    uniqueIndex('consents_user_client_active_idx')
      .on(t.userId, t.clientId)
      .where(sql`revoked_at IS NULL`),
  ],
);
