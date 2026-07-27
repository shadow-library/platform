/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { organisations } from './organisations.schema';
import { users } from './users.schema';

/**
 * Defining types
 */

export type Application = InferSelectModel<typeof applications>;
export namespace Application {
  export type Configuration = InferSelectModel<typeof applicationConfigurations>;
  export type Role = InferSelectModel<typeof applicationRoles>;
  export type Member = InferSelectModel<typeof applicationMembers>;

  export type Visibility = InferEnum<typeof applicationVisibility>;
  export type OrganisationApplication = InferSelectModel<typeof organisationApplications>;
  export type OrganisationApplicationSource = InferEnum<typeof organisationApplicationSource>;
}

/**
 * Declaring the constants
 */

/**
 * How widely an application may ever be granted (T-901). `PUBLIC` is generally available; `RESTRICTED`
 * reaches an organisation only after a platform release; `INTERNAL` is platform-staff only and reads as
 * an unknown client to everyone else. Distinct from assignment (which visible apps an org hands out) and
 * capability (feature gating inside the app).
 */
export const applicationVisibility = pgEnum('application_visibility', ['PUBLIC', 'RESTRICTED', 'INTERNAL']);

/** Which layer a row in `organisation_applications` came from: a platform release or an org self-assignment. */
export const organisationApplicationSource = pgEnum('organisation_application_source', ['PLATFORM_RELEASE', 'ORG_ASSIGNMENT']);

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  visibility: applicationVisibility('visibility').notNull().default('PUBLIC'),
  subDomain: varchar('sub_domain', { length: 255 }).notNull(),
  /** Public browser origins for this app's relying-party clients; each yields an `/api/auth/callback` redirect URI. */
  publicUrls: text('public_urls').array().notNull().default([]),
  homePageUrl: text('home_page_url'),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * The join of applications an organisation may grant beyond the generally-available `PUBLIC` set (T-901).
 * A `PLATFORM_RELEASE` row is the platform admin releasing a `RESTRICTED` app to the org; an
 * `ORG_ASSIGNMENT` row is an org admin adding a reachable app to its `ASSIGNED_ONLY` allowlist. `source`
 * is part of the key so the two layers coexist independently for the same (organisation, application).
 */
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
    /** A default role is unioned into every PDP resolution for the application; baseline users hold it with no `role_assignments` row (D-A6). */
    isDefault: boolean('is_default').notNull().default(false),
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
