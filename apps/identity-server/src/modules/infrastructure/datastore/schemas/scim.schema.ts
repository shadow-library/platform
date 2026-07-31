/**
 * Importing npm packages
 */
import { InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, boolean, integer, pgTable, primaryKey, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { applicationRoles } from './applications.schema';
import { organisations } from './organisations.schema';
import { users } from './users.schema';

/**
 * Defining types
 */

export type ScimDirectoryEntry = InferSelectModel<typeof scimDirectory>;
export type ScimGroup = InferSelectModel<typeof scimGroups>;
export type ScimGroupMember = InferSelectModel<typeof scimGroupMembers>;
export type ScimGroupRoleMapping = InferSelectModel<typeof scimGroupRoleMappings>;

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
 * Maps a tenant's directory group onto an application role (T-905, D-A9): every current and future
 * member of the group is granted the mapped role for the group's organisation, as ordinary
 * `role_assignments` rows carrying the `scim:group:<groupId>` provenance marker. The mapping is
 * provisioning-to-authorization glue only — it holds no assignments itself; the sync engine
 * materialises and revokes the marker rows. `unique(group_id, role_id)` makes a create idempotent.
 */
export const scimGroupRoleMappings = pgTable(
  'scim_group_role_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => scimGroups.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => applicationRoles.id, { onDelete: 'cascade' }),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('scim_group_role_mappings_group_role_unique').on(t.groupId, t.roleId)],
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
  roleMappings: many(scimGroupRoleMappings),
}));

export const scimGroupRoleMappingRelations = relations(scimGroupRoleMappings, ({ one }) => ({
  group: one(scimGroups, { fields: [scimGroupRoleMappings.groupId], references: [scimGroups.id] }),
  role: one(applicationRoles, { fields: [scimGroupRoleMappings.roleId], references: [applicationRoles.id] }),
}));

export const scimGroupMemberRelations = relations(scimGroupMembers, ({ one }) => ({
  group: one(scimGroups, { fields: [scimGroupMembers.groupId], references: [scimGroups.id] }),
  entry: one(scimDirectory, { fields: [scimGroupMembers.directoryId], references: [scimDirectory.id] }),
}));
