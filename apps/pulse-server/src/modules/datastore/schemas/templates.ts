/**
 * Importing npm packages
 */
import { InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { notificationChannel, priority } from './notification-jobs';

/**
 * Defining types
 */

export namespace Template {
  export type Group = InferSelectModel<typeof templateGroups>;
  export type Variant = InferSelectModel<typeof templateVariants>;
}

/**
 * Declaring the constants
 */

export const templateGroups = pgTable('template_groups', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  templateKey: varchar('template_key', { length: 255 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  priority: priority('priority').notNull().default('MEDIUM'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const templateVariants = pgTable(
  'template_variants',
  {
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
  },
  t => [unique('template_variants_template_group_id_channel_locale_unique').on(t.templateGroupId, t.channel, t.locale)],
);

/**
 * Declaring the relations
 */

export const templateGroupRelations = relations(templateGroups, ({ many }) => ({
  variants: many(templateVariants),
}));

export const templateVariantRelations = relations(templateVariants, ({ one }) => ({
  group: one(templateGroups, { fields: [templateVariants.templateGroupId], references: [templateGroups.id] }),
}));
