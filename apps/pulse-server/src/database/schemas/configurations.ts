/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, pgEnum, pgTable, smallint, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { notificationChannel } from './notification-jobs';
import { messageTypes } from './templates';

/**
 * Defining types
 */
export namespace Configuration {
  export type SenderProfile = InferSelectModel<typeof senderProfiles>;
  export type SenderEndpoint = InferSelectModel<typeof senderEndpoints>;
  export type SenderRoutingRule = InferSelectModel<typeof senderRoutingRules>;

  export type ServiceProvider = InferEnum<typeof notificationServiceProviders>;
}

/**
 * Declaring the constants
 */

export const notificationServiceProviders = pgEnum('notification_service_providers', ['DEV', 'SENDGRID', 'TWILIO', 'FIREBASE', 'AWS_SES']);

export const senderProfiles = pgTable('sender_profiles', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const senderEndpoints = pgTable(
  'sender_endpoints',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    senderProfileId: bigint('sender_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => senderProfiles.id, { onDelete: 'cascade' }),

    channel: notificationChannel('channel').notNull(),
    provider: notificationServiceProviders('provider').notNull(),

    identifier: varchar('identifier', { length: 500 }).notNull(),
    weight: smallint('weight').notNull().default(1),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('sender_endpoints_channel_provider_identifier_unique').on(t.channel, t.provider, t.identifier)],
);

export const senderRoutingRules = pgTable(
  'sender_routing_rules',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    senderProfileId: bigint('sender_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => senderProfiles.id, { onDelete: 'restrict' }),

    service: varchar('service', { length: 100 }),
    region: varchar('region', { length: 2 }),
    messageType: messageTypes('message_type'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('sender_routing_rules_service_region_message_type_unique').on(t.service, t.region, t.messageType)],
);

/**
 * Declaring the relations
 */

export const senderProfileRelations = relations(senderProfiles, ({ many }) => ({
  endpoints: many(senderEndpoints),
  routingRules: many(senderRoutingRules),
}));

export const senderEndpointRelations = relations(senderEndpoints, ({ one }) => ({
  profile: one(senderProfiles, { fields: [senderEndpoints.senderProfileId], references: [senderProfiles.id] }),
}));

export const senderRoutingRuleRelations = relations(senderRoutingRules, ({ one }) => ({
  profile: one(senderProfiles, { fields: [senderRoutingRules.senderProfileId], references: [senderProfiles.id] }),
}));
