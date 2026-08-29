import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { AnyPgColumn, bigint, bigserial, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { type DarkContentLevel, type Genre, type SexualContentLevel, type Tag, type ViolenceLevel } from '@shadow-library/sdk';

import { jsonb } from './jsonb';

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

// The catalog vocabulary a curated ingest carried in from its source, kept verbatim in `projects.importedMeta`
// so a curator can see what the source claimed. It is a suggestion for the publish step, never applied to the
// project itself: once landed, the forge is source of truth, and the reader-facing values live on the publication.
export interface ImportedNovelMetaData {
  genres?: Genre[];
  tags?: Tag[];
  sexualContent?: SexualContentLevel;
  violence?: ViolenceLevel;
  darkContent?: DarkContentLevel;
}

export namespace Project {
  export type Row = InferSelectModel<typeof projects>;
  // The row as surfaced by `ProjectService.present`: the stored `config = null` is mapped to an omitted
  // (`undefined`) field so it satisfies the non-nullable `ProjectConfig` response schema, and the stored
  // `coverImagePath` ref gains its resolved `coverUrl`. The ref stays on the type for internal callers
  // (the export packer reads bytes by ref); only `coverUrl` is declared on the response DTO, so the
  // serialiser is what keeps the ref off the wire.
  export type Presented = Omit<Row, 'config'> & { config?: ProjectConfigData; coverUrl?: string };
  export type Kind = InferEnum<typeof projectKind>;
  export type Status = InferEnum<typeof projectStatus>;
  export type ContentMode = InferEnum<typeof contentMode>;
  export type ContentGenerator = InferEnum<typeof contentGenerator>;
}

export const projectKind = pgEnum('project_kind', ['source', 'new_novel']);
// A `seed` project is an idea under construction in the Ideation Studio: it owns chat, proposal and run
// history like any project, but the generation, planning and publishing pipelines reject it until
// graduation flips it to `active` (ideation-studio design §2.1).
export const projectStatus = pgEnum('project_status', ['seed', 'active']);
export const contentMode = pgEnum('content_mode', ['standard', 'unrestricted']);
export const contentGenerator = pgEnum('content_generator', ['standard', 'unrestricted', 'human']);

export const projects = pgTable(
  'projects',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    ownerId: bigint('owner_id', { mode: 'bigint' }),
    name: varchar('name', { length: 255 }).notNull(),
    kind: projectKind('kind').notNull(),
    status: projectStatus('status').notNull().default('active'),
    title: varchar('title', { length: 500 }),
    coverImagePath: varchar('cover_image_path'),
    contentMode: contentMode('content_mode').notNull().default('standard'),
    config: jsonb('config').$type<ProjectConfigData>(),
    brief: text('brief'),
    premise: text('premise'),
    themes: jsonb('themes'),
    instructions: text('instructions'),
    /** The external identity a curated ingest keys on (`<source>:<id>`); null for everything the forge itself created. */
    sourceRef: varchar('source_ref', { length: 64 }),
    originalAuthor: varchar('original_author', { length: 256 }),
    importedMeta: jsonb('imported_meta').$type<ImportedNovelMetaData>(),
    sourceProjectId: bigint('source_project_id', { mode: 'bigint' }).references((): AnyPgColumn => projects.id, { onDelete: 'set null' }),
    storyCurrentChapter: integer('story_current_chapter').default(0),
    storyCurrentVolumeKey: varchar('story_current_volume_key'),
    skeletonCharacterArcs: jsonb('skeleton_character_arcs'),
    skeletonPowerCurve: text('skeleton_power_curve'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('projects_source_ref_unique').on(t.sourceRef)],
);

export const projectRelations = relations(projects, ({ one }) => ({
  sourceProject: one(projects, { fields: [projects.sourceProjectId], references: [projects.id], relationName: 'sourceProject' }),
}));
