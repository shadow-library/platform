import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, jsonb, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.schema';

export type OrganisationPolicy = InferSelectModel<typeof organisationPolicies>;

export const organisationPolicies = pgTable(
  'organisation_policies',
  {
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    policyKey: varchar('policy_key', { length: 128 }).notNull(),
    policyValue: jsonb('policy_value').notNull(),
    updatedBy: bigint('updated_by', { mode: 'bigint' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.organisationId, t.policyKey] })],
);

export const organisationPolicyRelations = relations(organisationPolicies, ({ one }) => ({
  organisation: one(organisations, { fields: [organisationPolicies.organisationId], references: [organisations.id] }),
}));
