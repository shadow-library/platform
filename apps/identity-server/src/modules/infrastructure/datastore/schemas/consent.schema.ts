import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { bigint, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

export type Consent = InferSelectModel<typeof consents>;

export namespace Consent {
  export type Source = InferEnum<typeof consentSource>;
}

export const consentSource = pgEnum('consent_source', ['USER', 'FIRST_PARTY_POLICY', 'ADMIN']);

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 64 }).notNull(),
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
