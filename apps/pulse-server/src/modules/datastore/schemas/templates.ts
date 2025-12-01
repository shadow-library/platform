/**
 * Importing npm packages
 */
import { bigint, bigserial, boolean, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { notificationChannel } from './configurations';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const priority = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH']);

export const templateGroups = pgTable('template_groups', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  template_key: varchar('template_key', { length: 255 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  priority: priority('priority').notNull().default('MEDIUM'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const templateVariants = pgTable('template_variants', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  templateGroupId: bigint('template_group_id', { mode: 'bigint' })
    .notNull()
    .references(() => templateGroups.id, { onDelete: 'cascade' }),

  channel: notificationChannel('channel').notNull(),
  locale: varchar('locale', { length: 10 }).notNull(),

  subject: varchar('subject', { length: 255 }),
  body: varchar('body', { length: 5000 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
