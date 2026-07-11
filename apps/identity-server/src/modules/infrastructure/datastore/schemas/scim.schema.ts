/**
 * Importing npm packages
 */
import { InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, boolean, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { organisations } from './organisations.schema';
import { users } from './users.schema';

/**
 * Defining types
 */

export type ScimDirectoryEntry = InferSelectModel<typeof scimDirectory>;
export type ScimGroup = InferSelectModel<typeof scimGroups>;
export type ScimGroupMember = InferSelectModel<typeof scimGroupMembers>;

/**
 * Declaring the constants
 *
 * The SCIM directory is a tenant's provisioning view (T-704): each row maps an org to a user the
 * tenant manages, under a SCIM resource id that never leaks platform user ids. `managed` is the
 * ownership boundary — true means the account was born via this tenant's SCIM and may be
 * deactivated at account level; false marks an adopted pre-existing account whose deprovisioning
 * only ever strips org membership, never touches the account itself.
 */

export const scimDirectory = pgTable(
  'scim_directory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userName: varchar('user_name', { length: 255 }).notNull(),
    externalId: varchar('external_id', { length: 255 }),
    active: boolean('active').notNull().default(true),
    managed: boolean('managed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('scim_directory_org_user_unique').on(t.organisationId, t.userId),
    uniqueIndex('scim_directory_org_user_name_unique').on(t.organisationId, sql`lower(${t.userName})`),
    uniqueIndex('scim_directory_org_external_id_unique')
      .on(t.organisationId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const scimGroups = pgTable(
  'scim_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    externalId: varchar('external_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex('scim_groups_org_display_name_unique').on(t.organisationId, sql`lower(${t.displayName})`)],
);

export const scimGroupMembers = pgTable(
  'scim_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => scimGroups.id, { onDelete: 'cascade' }),
    directoryId: uuid('directory_id')
      .notNull()
      .references(() => scimDirectory.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.groupId, t.directoryId] })],
);

/**
 * Declaring the relations
 */

export const scimDirectoryRelations = relations(scimDirectory, ({ one, many }) => ({
  organisation: one(organisations, { fields: [scimDirectory.organisationId], references: [organisations.id] }),
  user: one(users, { fields: [scimDirectory.userId], references: [users.id] }),
  groupMemberships: many(scimGroupMembers),
}));

export const scimGroupRelations = relations(scimGroups, ({ many }) => ({
  members: many(scimGroupMembers),
}));

export const scimGroupMemberRelations = relations(scimGroupMembers, ({ one }) => ({
  group: one(scimGroups, { fields: [scimGroupMembers.groupId], references: [scimGroups.id] }),
  entry: one(scimDirectory, { fields: [scimGroupMembers.directoryId], references: [scimDirectory.id] }),
}));
