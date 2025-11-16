/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, boolean, index, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type Service = InferSelectModel<typeof services>;
export namespace Service {
  export type PublicKeyAlgorithm = InferEnum<typeof publicKeyAlgorithm>;

  export type Key = InferSelectModel<typeof serviceKeys>;
  export type Configuration = InferSelectModel<typeof serviceConfigurations>;
  export type Role = InferSelectModel<typeof serviceRoles>;
}

/**
 * Declaring the constants
 */

export const publicKeyAlgorithm = pgEnum('public_key_algorithm', ['ECDSA', 'ECDHE', 'EdDSA', 'RSA_3072', 'RSA_4096']);

export const services = pgTable('services', {
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

export const serviceKeys = pgTable(
  'service_keys',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    serviceId: bigint('service_id', { mode: 'bigint' })
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    algorithm: publicKeyAlgorithm('algorithm').notNull(),
    isDefault: boolean('is_default').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('service_keys_service_id_idx').on(t.serviceId)],
);

export const serviceConfigurations = pgTable(
  'service_configurations',
  {
    serviceId: bigint('service_id', { mode: 'bigint' })
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    configName: varchar('config_name', { length: 255 }).notNull(),
    configValue: text('config_value').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.serviceId, t.configName] })],
);

export const serviceRoles = pgTable(
  'service_roles',
  {
    id: serial('id').primaryKey(),
    serviceId: bigint('service_id', { mode: 'bigint' })
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    roleName: varchar('role_name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [index('service_roles_service_id_idx').on(t.serviceId), unique('service_roles_service_role_unique').on(t.serviceId, t.roleName)],
);

/**
 * Declaring the relations
 */

export const serviceRelations = relations(services, ({ many }) => ({
  keys: many(serviceKeys),
  configurations: many(serviceConfigurations),
  roles: many(serviceRoles),
}));

export const serviceKeyRelations = relations(serviceKeys, ({ one }) => ({
  service: one(services, { fields: [serviceKeys.serviceId], references: [services.id] }),
}));

export const serviceConfigurationRelations = relations(serviceConfigurations, ({ one }) => ({
  service: one(services, { fields: [serviceConfigurations.serviceId], references: [services.id] }),
}));

export const serviceRoleRelations = relations(serviceRoles, ({ one }) => ({
  service: one(services, { fields: [serviceRoles.serviceId], references: [services.id] }),
}));
