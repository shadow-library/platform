import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.schema';
import { users } from './users.schema';

export type Application = InferSelectModel<typeof applications>;
export namespace Application {
  export type Configuration = InferSelectModel<typeof applicationConfigurations>;
  export type Role = InferSelectModel<typeof applicationRoles>;
  export type Member = InferSelectModel<typeof applicationMembers>;

  export type Visibility = InferEnum<typeof applicationVisibility>;
  export type OrganisationApplication = InferSelectModel<typeof organisationApplications>;
  export type OrganisationApplicationSource = InferEnum<typeof organisationApplicationSource>;
}

export const applicationVisibility = pgEnum('application_visibility', ['PUBLIC', 'RESTRICTED', 'INTERNAL']);

export const organisationApplicationSource = pgEnum('organisation_application_source', ['PLATFORM_RELEASE', 'ORG_ASSIGNMENT']);

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  visibility: applicationVisibility('visibility').notNull().default('PUBLIC'),
  subDomain: varchar('sub_domain', { length: 255 }).notNull(),
  publicUrls: text('public_urls').array().notNull().default([]),
  homePageUrl: text('home_page_url'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const organisationApplications = pgTable(
  'organisation_applications',
  {
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    source: organisationApplicationSource('source').notNull(),
    assignedBy: varchar('assigned_by', { length: 64 }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.organisationId, t.applicationId, t.source] }), index('organisation_applications_application_id_idx').on(t.applicationId)],
);

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
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('application_roles_application_id_idx').on(t.applicationId), unique('application_roles_application_role_unique').on(t.applicationId, t.roleName)],
);

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

export const applicationRelations = relations(applications, ({ many }) => ({
  configurations: many(applicationConfigurations),
  roles: many(applicationRoles),
  members: many(applicationMembers),
  organisationGrants: many(organisationApplications),
}));

export const organisationApplicationRelations = relations(organisationApplications, ({ one }) => ({
  application: one(applications, { fields: [organisationApplications.applicationId], references: [applications.id] }),
  organisation: one(organisations, { fields: [organisationApplications.organisationId], references: [organisations.id] }),
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
