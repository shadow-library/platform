/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, pgEnum, pgTable, primaryKey, smallint, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

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
  export type SenderProfileAssignment = InferSelectModel<typeof senderProfileAssignments>;

  export type ServiceProvider = InferEnum<typeof notificationServiceProviders>;
}

/**
 * Declaring the constants
 */

export const notificationServiceProviders = pgEnum('notification_service_providers', ['SENDGRID', 'TWILIO', 'FIREBASE', 'AWS_SES']);

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

export const senderProfileAssignments = pgTable(
  'sender_profile_assignments',
  {
    senderProfileId: bigint('sender_profile_id', { mode: 'bigint' })
      .notNull()
      .references(() => senderProfiles.id, { onDelete: 'restrict' }),

    messageType: messageTypes('message_type').notNull(),
    region: varchar('region', { length: 2 }).notNull().default('ZZ'),
    serviceName: varchar('service_name', { length: 100 }).notNull().default('DEFAULT'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [primaryKey({ columns: [t.serviceName, t.messageType, t.region] })],
);

/**
 * Declaring the relations
 */

export const senderProfileRelations = relations(senderProfiles, ({ many }) => ({
  endpoints: many(senderEndpoints),
  assignments: many(senderProfileAssignments),
}));

export const senderEndpointRelations = relations(senderEndpoints, ({ one }) => ({
  profile: one(senderProfiles, { fields: [senderEndpoints.senderProfileId], references: [senderProfiles.id] }),
}));

export const senderProfileAssignmentRelations = relations(senderProfileAssignments, ({ one }) => ({
  profile: one(senderProfiles, { fields: [senderProfileAssignments.senderProfileId], references: [senderProfiles.id] }),
}));
