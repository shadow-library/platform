/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { AnyPgColumn, bigint, bigserial, boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export namespace Project {
  export type Row = InferSelectModel<typeof projects>;
  export type Kind = InferEnum<typeof projectKind>;
  export type ContentMode = InferEnum<typeof contentMode>;
  export type ContentGenerator = InferEnum<typeof contentGenerator>;
}

/**
 * Declaring the constants
 */

export const projectKind = pgEnum('project_kind', ['source', 'new_novel']);
export const contentMode = pgEnum('content_mode', ['standard', 'grok_only']);
export const contentGenerator = pgEnum('content_generator', ['standard', 'grok']);

export const projects = pgTable('projects', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  ownerId: bigint('owner_id', { mode: 'bigint' }),
  name: varchar('name', { length: 255 }).notNull().unique(),
  kind: projectKind('kind').notNull(),
  title: varchar('title', { length: 500 }),
  contentMode: contentMode('content_mode').notNull().default('standard'),
  config: jsonb('config'),
  brief: text('brief'),
  premise: text('premise'),
  themes: jsonb('themes'),
  instructions: text('instructions'),
  sourceProjectId: bigint('source_project_id', { mode: 'bigint' }).references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
  sourceUrl: varchar('source_url'),
  sourceAdapter: varchar('source_adapter'),
  sourceNovelId: varchar('source_novel_id'),
  scrapeNextUrl: varchar('scrape_next_url'),
  scrapeNextNumber: integer('scrape_next_number').notNull().default(1),
  scrapeComplete: boolean('scrape_complete').notNull().default(false),
  storyCurrentChapter: integer('story_current_chapter').default(0),
  storyCurrentVolumeKey: varchar('story_current_volume_key'),
  skeletonCharacterArcs: jsonb('skeleton_character_arcs'),
  skeletonPowerCurve: text('skeleton_power_curve'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const projectRelations = relations(projects, ({ one }) => ({
  sourceProject: one(projects, { fields: [projects.sourceProjectId], references: [projects.id], relationName: 'sourceProject' }),
}));
