/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, index, integer, pgEnum, pgTable, primaryKey, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { applicationRoles, applications } from './applications.schema';
import { oauthClients } from './oauth.schema';

/**
 * Defining types
 */

export type Permission = InferSelectModel<typeof permissions>;
export type RoleAssignment = InferSelectModel<typeof roleAssignments>;
export type ServiceRouteAccess = InferSelectModel<typeof serviceRouteAccess>;

export namespace RoleAssignment {
  export type PrincipalType = InferEnum<typeof principalType>;
}

/**
 * Declaring the constants
 */

export const principalType = pgEnum('principal_type', ['USER', 'SERVICE_ACCOUNT']);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 255 }),
  },
  t => [unique('permissions_application_name_unique').on(t.applicationId, t.name)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: integer('role_id')
      .notNull()
      .references(() => applicationRoles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/**
 * Assigns a role to a principal within an organisation (D-1: always org-scoped). `principal_id`
 * holds a user id or an OAuth client id depending on `principal_type`; there is deliberately no
 * cross-type foreign key.
 */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    principalType: principalType('principal_type').notNull(),
    principalId: varchar('principal_id', { length: 64 }).notNull(),
    roleId: integer('role_id')
      .notNull()
      .references(() => applicationRoles.id, { onDelete: 'cascade' }),
    organisationId: bigint('organisation_id', { mode: 'bigint' }).notNull(),
    grantedBy: varchar('granted_by', { length: 64 }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  t => [unique('role_assignments_unique').on(t.principalType, t.principalId, t.roleId, t.organisationId)],
);

/**
 * Admin-configured M2M route allowlist (D-17): which caller client may invoke which routes of the
 * target application. Consuming services load their own rules at startup through the SDK and
 * enforce them locally (deny-by-default for service tokens); route code carries no caller names.
 */
export const serviceRouteAccess = pgTable(
  'service_route_access',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    callerClientId: uuid('caller_client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    /** HTTP method the rule covers, or `*` for all methods */
    method: varchar('method', { length: 10 }).notNull(),
    /** Route path the rule covers; a trailing `*` matches any suffix */
    pathPattern: varchar('path_pattern', { length: 512 }).notNull(),
    createdBy: varchar('created_by', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('service_route_access_application_id_idx').on(t.applicationId), unique('service_route_access_unique').on(t.applicationId, t.callerClientId, t.method, t.pathPattern)],
);

/**
 * Declaring the relations
 */

export const permissionRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionRelations = relations(rolePermissions, ({ one }) => ({
  role: one(applicationRoles, { fields: [rolePermissions.roleId], references: [applicationRoles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));
