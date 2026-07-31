/**
 * Importing npm packages
 */
import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, jsonb, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { organisations } from './organisations.schema';

/**
 * Defining types
 */

export type OrganisationPolicy = InferSelectModel<typeof organisationPolicies>;

/**
 * Declaring the constants
 */

/**
 * Per-organisation overrides of a platform security setting, addressed by a registry-declared key.
 * The value is `jsonb` so a future policy can carry a boolean, list or object without a migration;
 * the key's type, bounds and fold strategy live in the policy registry, and any key absent from that
 * registry is refused on write — the table stays generic without becoming a junk drawer.
 */
export const organisationPolicies = pgTable(
  'organisation_policies',
  {
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    policyKey: varchar('policy_key', { length: 128 }).notNull(),
    policyValue: jsonb('policy_value').notNull(),
    /** The administrator who last set the value; retained for the audit trail, nullable for system writes. */
    updatedBy: bigint('updated_by', { mode: 'bigint' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.organisationId, t.policyKey] })],
);

/**
 * Declaring the relations
 */

export const organisationPolicyRelations = relations(organisationPolicies, ({ one }) => ({
  organisation: one(organisations, { fields: [organisationPolicies.organisationId], references: [organisations.id] }),
}));
