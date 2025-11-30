/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, pgEnum, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { users } from './users.schema';

/**
 * Defining types
 */

export type Organisation = InferSelectModel<typeof organisations>;

export namespace Organisation {
  export type Member = InferSelectModel<typeof organisationMembers>;

  export type MemberRole = InferEnum<typeof organisationMemberRole>;
}

/**
 * Declaring the constants
 */

export const organisationMemberRole = pgEnum('organisation_member_role', ['OWNER', 'ADMIN', 'MEMBER']);

export const organisations = pgTable('organisations', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const organisationMembers = pgTable(
  'organisation_members',
  {
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    role: organisationMemberRole('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.organisationId, t.userId] })],
);

/**
 * Declaring the relations
 */

export const organisationRelations = relations(organisations, ({ many }) => ({
  members: many(organisationMembers),
}));

export const organisationMemberRelations = relations(organisationMembers, ({ one }) => ({
  organisation: one(organisations, { fields: [organisationMembers.organisationId], references: [organisations.id] }),
  user: one(users, { fields: [organisationMembers.userId], references: [users.id] }),
}));
