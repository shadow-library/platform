/**
 * Importing npm packages
 */
import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { users } from './users.schema';

/**
 * Defining types
 */

export type Application = InferSelectModel<typeof applications>;
export namespace Application {
  export type Configuration = InferSelectModel<typeof applicationConfigurations>;
  export type Role = InferSelectModel<typeof applicationRoles>;
  export type Member = InferSelectModel<typeof applicationMembers>;
}

/**
 * Declaring the constants
 */

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  subDomain: varchar('sub_domain', { length: 255 }).notNull(),
  homePageUrl: text('home_page_url'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const applicationConfigurations = pgTable(
  'application_configurations',
  {
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    configName: varchar('config_name', { length: 255 }).notNull(),
    configValue: text('config_value').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.applicationId, t.configName] })],
);

export const applicationRoles = pgTable(
  'application_roles',
  {
    id: serial('id').primaryKey(),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    roleName: varchar('role_name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('application_roles_application_id_idx').on(t.applicationId), unique('application_roles_application_role_unique').on(t.applicationId, t.roleName)],
);

/**
 * A user's membership in an application, provisioned the first time the user authorises any of the
 * application's OAuth clients (first consent grant). It is the stable per-user, per-application
 * anchor products hang default roles and state on; `last_used_at` is refreshed on each subsequent
 * grant. Distinct from a SERVICE OAuth client — the M2M "service account" (D-2) — which this is not.
 */
export const applicationMembers = pgTable(
  'application_members',
  {
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstUsedAt: timestamp('first_used_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.applicationId, t.userId] }), index('application_members_user_id_idx').on(t.userId)],
);

/**
 * Declaring the relations
 */

export const applicationRelations = relations(applications, ({ many }) => ({
  configurations: many(applicationConfigurations),
  roles: many(applicationRoles),
  members: many(applicationMembers),
}));

export const applicationMemberRelations = relations(applicationMembers, ({ one }) => ({
  application: one(applications, { fields: [applicationMembers.applicationId], references: [applications.id] }),
  user: one(users, { fields: [applicationMembers.userId], references: [users.id] }),
}));

export const applicationConfigurationRelations = relations(applicationConfigurations, ({ one }) => ({
  application: one(applications, { fields: [applicationConfigurations.applicationId], references: [applications.id] }),
}));

export const applicationRoleRelations = relations(applicationRoles, ({ one }) => ({
  application: one(applications, { fields: [applicationRoles.applicationId], references: [applications.id] }),
}));
