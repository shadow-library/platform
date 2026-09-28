import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, check, index, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { type Genre } from '@shadow-library/sdk';

import { type FinalizeReview } from './finalize-review';
import { jsonb } from './jsonb';
import { ownerKind } from './owner';

// Per-role model overrides persisted in `projects.config` (jsonb). Mirrors the wire `ProjectConfig`/
// `ProjectModelOverrides` in project.dto (enumerated, not an index signature, so it round-trips in both
// directions: read → response, and write ← create/clone input) — keep the two structurally in sync.
interface ProjectModelRefData {
  provider: string;
  model: string;
}

interface ProjectModelOverridesData {
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
  bible?: ProjectModelRefData;
  premise?: ProjectModelRefData;
  audit?: ProjectModelRefData;
  chat?: ProjectModelRefData;
  compact?: ProjectModelRefData;
  image?: ProjectModelRefData;
}

export interface ProjectFinalizeReviewData {
  autoKeep?: FinalizeReview.Category[];
}

export interface ProjectConfigData {
  models?: ProjectModelOverridesData;
  finalizeReview?: ProjectFinalizeReviewData;
}

// The genre a novel-import bundle carried in, when it matches the platform list, kept in `projects.importedMeta`. It is
// a suggestion for the publish step, never applied to the project itself: once landed, the forge is source of truth,
// and the reader-facing values live on the publication.
export interface ImportedNovelMetaData {
  genres?: Genre[];
}

export namespace Project {
  export type Row = InferSelectModel<typeof projects>;
  export interface WordTarget {
    min: number;
    max: number;
  }
  // The row as surfaced by `ProjectService.present`: the stored `config = null` is mapped to an omitted
  // (`undefined`) field so it satisfies the non-nullable `ProjectConfig` response schema, and the stored
  // `coverImagePath` ref gains its resolved `coverUrl`. The ref stays on the type for internal callers
  // (the export packer reads bytes by ref); only `coverUrl` is declared on the response DTO, so the
  // serialiser is what keeps the ref off the wire. `wordTargetMin`/`wordTargetMax` collapse the same way
  // into a single optional `wordTarget` object, or an omitted field when either half is null.
  export type Presented = Omit<Row, 'config' | 'wordTargetMin' | 'wordTargetMax'> & { config?: ProjectConfigData; coverUrl?: string; wordTarget?: WordTarget };
  export type PresentedDetail = Presented & { defaultInstructions: string; defaultCopyRemoved: boolean };
  export type Kind = InferEnum<typeof projectKind>;
  export type ContentMode = InferEnum<typeof contentMode>;
  export type ContentGenerator = InferEnum<typeof contentGenerator>;
  export type CostTier = InferEnum<typeof costTier>;
}

export const projectKind = pgEnum('project_kind', ['new_novel']);
export const contentMode = pgEnum('content_mode', ['standard', 'unrestricted']);
export const contentGenerator = pgEnum('content_generator', ['standard', 'unrestricted', 'human']);
export const costTier = pgEnum('cost_tier', ['economy', 'balanced', 'performant']);

export const projects = pgTable(
  'projects',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    ownerKind: ownerKind('owner_kind').notNull().default('user'),
    ownerId: bigint('owner_id', { mode: 'bigint' }),
    /** The organisation the owner acts for, and the scope `sharedWithOrg` shares into. Required of a bot owner; nothing writes it for a user-owned project today. */
    organisationId: bigint('organisation_id', { mode: 'bigint' }),
    /** Opens the project to organisation members holding `novel-forge:curate`, on top of its owner. */
    sharedWithOrg: boolean('shared_with_org').notNull().default(false),
    name: varchar('name', { length: 255 }).notNull(),
    kind: projectKind('kind').notNull(),
    title: varchar('title', { length: 500 }),
    coverImagePath: varchar('cover_image_path'),
    contentMode: contentMode('content_mode').notNull().default('standard'),
    costTier: costTier('cost_tier').notNull().default('balanced'),
    config: jsonb('config').$type<ProjectConfigData>(),
    /** Chapter scene-prose word-count floor; null means the generation pipeline's default band applies. Always set together with `wordTargetMax`. */
    wordTargetMin: integer('word_target_min'),
    /** Chapter scene-prose word-count ceiling; null means the generation pipeline's default band applies. Always set together with `wordTargetMin`. */
    wordTargetMax: integer('word_target_max'),
    brief: text('brief'),
    premise: text('premise'),
    themes: jsonb('themes'),
    instructions: text('instructions'),
    theme: text('theme'),
    endingQuestion: text('ending_question'),
    /** The planned ending; only the planner reads it, never the chapter writer or publishing. */
    ending: text('ending'),
    readerPromise: text('reader_promise'),
    protagonistKey: varchar('protagonist_key'),
    opposition: text('opposition'),
    importedMeta: jsonb('imported_meta').$type<ImportedNovelMetaData>(),
    storyCurrentChapter: integer('story_current_chapter').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [
    index('projects_owner_kind_owner_id_idx').on(t.ownerKind, t.ownerId),
    // Backs ProjectService.list()'s sharing branch (a seq scan otherwise, once for $count and once for findMany).
    index('projects_shared_with_org_organisation_id_idx')
      .on(t.organisationId)
      .where(sql`${t.sharedWithOrg}`),
    check('projects_bot_owner_organisation_check', sql`${t.ownerKind} <> 'bot' OR ${t.organisationId} IS NOT NULL`),
    check(
      'projects_word_target_check',
      sql`(${t.wordTargetMin} IS NULL AND ${t.wordTargetMax} IS NULL) OR (${t.wordTargetMin} IS NOT NULL AND ${t.wordTargetMax} IS NOT NULL AND ${t.wordTargetMax} > ${t.wordTargetMin})`,
    ),
  ],
);
