/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { AnyPgColumn, bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { jsonb } from './jsonb';

/**
 * Defining types
 */

// Per-role model overrides persisted in `projects.config` (jsonb). Mirrors the wire `ProjectConfig`/
// `ProjectModelOverrides` in project.dto (enumerated, not an index signature, so it round-trips in both
// directions: read → response, and write ← create/clone input) — keep the two structurally in sync.
export interface ProjectModelRefData {
  provider: string;
  model: string;
}

export interface ProjectModelOverridesData {
  extraction?: ProjectModelRefData;
  generation?: ProjectModelRefData;
  judge?: ProjectModelRefData;
  fix?: ProjectModelRefData;
  outline?: ProjectModelRefData;
  revision?: ProjectModelRefData;
  title?: ProjectModelRefData;
  continuity?: ProjectModelRefData;
  validation?: ProjectModelRefData;
  review?: ProjectModelRefData;
  plan?: ProjectModelRefData;
  skeleton?: ProjectModelRefData;
  bible?: ProjectModelRefData;
  premise?: ProjectModelRefData;
  audit?: ProjectModelRefData;
  chat?: ProjectModelRefData;
  compact?: ProjectModelRefData;
  arc?: ProjectModelRefData;
  embedding?: ProjectModelRefData;
  image?: ProjectModelRefData;
}

export interface ProjectConfigData {
  models?: ProjectModelOverridesData;
}

export namespace Project {
  export type Row = InferSelectModel<typeof projects>;
  // The row as surfaced by `ProjectService.present`: the stored `config = null` is mapped to an omitted
  // (`undefined`) field so it satisfies the non-nullable `ProjectConfig` response schema.
  export type Presented = Omit<Row, 'config'> & { config?: ProjectConfigData };
  export type Kind = InferEnum<typeof projectKind>;
  export type ContentMode = InferEnum<typeof contentMode>;
  export type ContentGenerator = InferEnum<typeof contentGenerator>;
}

/**
 * Declaring the constants
 */

export const projectKind = pgEnum('project_kind', ['source', 'new_novel']);
export const contentMode = pgEnum('content_mode', ['standard', 'grok_only']);
export const contentGenerator = pgEnum('content_generator', ['standard', 'grok', 'human']);

export const projects = pgTable('projects', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  ownerId: bigint('owner_id', { mode: 'bigint' }),
  name: varchar('name', { length: 255 }).notNull(),
  kind: projectKind('kind').notNull(),
  title: varchar('title', { length: 500 }),
  coverImagePath: varchar('cover_image_path'),
  contentMode: contentMode('content_mode').notNull().default('standard'),
  config: jsonb('config').$type<ProjectConfigData>(),
  brief: text('brief'),
  premise: text('premise'),
  themes: jsonb('themes'),
  instructions: text('instructions'),
  sourceProjectId: bigint('source_project_id', { mode: 'bigint' }).references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
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
