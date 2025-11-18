/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { boolean, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Application = InferSelectModel<typeof applications>;
export namespace Application {
  export type PublicKeyAlgorithm = InferEnum<typeof publicKeyAlgorithm>;

  export type Key = InferSelectModel<typeof applicationKeys>;
  export type Configuration = InferSelectModel<typeof applicationConfigurations>;
  export type Role = InferSelectModel<typeof applicationRoles>;
}

/**
 * Declaring the constants
 */

export const publicKeyAlgorithm = pgEnum('public_key_algorithm', ['ECDSA', 'ECDHE', 'EdDSA', 'RSA_3072', 'RSA_4096']);

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

export const applicationKeys = pgTable(
  'application_keys',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    algorithm: publicKeyAlgorithm('algorithm').notNull(),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('application_keys_application_id_idx').on(t.applicationId)],
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('application_roles_application_id_idx').on(t.applicationId), unique('application_roles_application_role_unique').on(t.applicationId, t.roleName)],
);

/**
 * Declaring the relations
 */

export const applicationRelations = relations(applications, ({ many }) => ({
  keys: many(applicationKeys),
  configurations: many(applicationConfigurations),
  roles: many(applicationRoles),
}));

export const applicationKeyRelations = relations(applicationKeys, ({ one }) => ({
  application: one(applications, { fields: [applicationKeys.applicationId], references: [applications.id] }),
}));

export const applicationConfigurationRelations = relations(applicationConfigurations, ({ one }) => ({
  application: one(applications, { fields: [applicationConfigurations.applicationId], references: [applications.id] }),
}));

export const applicationRoleRelations = relations(applicationRoles, ({ one }) => ({
  application: one(applications, { fields: [applicationRoles.applicationId], references: [applications.id] }),
}));
