import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { type ContentRating } from '@shadow-library/sdk';

import { jsonb } from './jsonb';
import { contentGenerator, projects } from './projects';

export namespace Generation {
  export type Draft = InferSelectModel<typeof drafts>;
  export type ChapterImage = InferSelectModel<typeof chapterImages>;
  export type Brief = InferSelectModel<typeof briefs>;
  export type ContinuityProposal = InferSelectModel<typeof continuityProposals>;
  export type DraftStatus = InferEnum<typeof draftStatus>;
  export type JudgeVerdict = InferEnum<typeof judgeVerdict>;
  export type ContinuityProposalStatus = InferEnum<typeof continuityProposalStatus>;
  export type DraftReviewStatus = InferEnum<typeof draftReviewStatus>;
  export type BriefWriteMode = InferEnum<typeof briefWriteMode>;
}

export const draftStatus = pgEnum('draft_status', ['draft', 'final']);
export const judgeVerdict = pgEnum('judge_verdict', ['consistent', 'contradiction', 'evaluation_failed']);
export const continuityProposalStatus = pgEnum('continuity_proposal_status', ['pending', 'applied', 'discarded']);
export const draftReviewStatus = pgEnum('draft_review_status', ['generating', 'needs_review', 'contradiction', 'approved', 'final']);
export const briefWriteMode = pgEnum('brief_write_mode', ['standard', 'external']);

export const drafts = pgTable(
  'drafts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    title: varchar('title', { length: 500 }),
    status: draftStatus('status').notNull().default('draft'),
    revision: integer('revision').notNull().default(0),
    words: integer('words'),
    volumeKey: varchar('volume_key'),
    summary: text('summary'),
    body: text('body').notNull(),
    state: jsonb('state').$type<Record<string, unknown>>(),
    generator: contentGenerator('generator').notNull().default('standard'),
    // Independent of `generator`: that records who wrote the draft, this records whether its prose is
    // firewalled from the vector index, continuity extraction, and the verbatim-prose adjacency rule — a
    // `novel-import` final-mode chapter is `human` and not isolated; pasted explicit prose is `human` and isolated.
    isolated: boolean('isolated').notNull().default(false),
    /** Null is *unrated*, never `'none'` — the reader stores and filters the two differently, so an unset dimension must never be defaulted. */
    contentRating: jsonb('content_rating').$type<ContentRating>(),
    judge: judgeVerdict('judge'),
    judgeNote: text('judge_note'),
    reviewStatus: draftReviewStatus('review_status').notNull().default('generating'),
    // Set when an ancestor chapter is mutated; approval is refused until the chapter is regenerated.
    staleReason: varchar('stale_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('drafts_project_id_chapter_unique').on(t.projectId, t.chapter)],
);

// Scene illustrations attached to an authored chapter, keyed by chapter number so they survive draft
// re-generation; the drafter cleans them up explicitly when a chapter is deleted or renumbered.
export const chapterImages = pgTable(
  'chapter_images',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    imagePath: varchar('image_path').notNull(),
    caption: varchar('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('chapter_images_project_id_chapter_idx').on(t.projectId, t.chapter)],
);

export const briefs = pgTable(
  'briefs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    volumeKey: varchar('volume_key'),
    arcKey: varchar('arc_key'),
    title: varchar('title'),
    body: text('body').notNull(),
    contextRefs: jsonb('context_refs').$type<string[]>(),
    pov: varchar('pov'),
    endingContract: jsonb('ending_contract'),
    knowledgeContract: jsonb('knowledge_contract'),
    chapterPurpose: text('chapter_purpose'),
    readerValue: jsonb('reader_value'),
    repetitionRisks: jsonb('repetition_risks'),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    staleReason: varchar('stale_reason'),
    // Set by the human edit paths; arc reconciliation refuses to overwrite a brief carrying it.
    handEdited: boolean('hand_edited').notNull().default(false),
    // Planning-time declaration, independent of the runtime `isolated` containment flag on chapters/drafts — a
    // brief can be marked `external` before any prose exists. `'external'` tells the primary writer's batch
    // loop to skip this slot; it is filled by generate-unrestricted or drafts/:n/import instead.
    writeMode: briefWriteMode('write_mode').notNull().default('standard'),
    // Non-null marks a brief created by the insert operation rather than by an outline pass.
    insertedAt: timestamp('inserted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('briefs_project_id_chapter_unique').on(t.projectId, t.chapter), index('briefs_project_id_arc_key_idx').on(t.projectId, t.arcKey)],
);

export const continuityProposals = pgTable(
  'continuity_proposals',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    status: continuityProposalStatus('status').notNull().default('pending'),
    proposal: jsonb('proposal').$type<Record<string, unknown>>().notNull(),
    model: varchar('model'),
    appliedAt: timestamp('applied_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('continuity_proposals_project_id_chapter_unique').on(t.projectId, t.chapter)],
);

export const draftsRelations = relations(drafts, ({ one }) => ({
  project: one(projects, { fields: [drafts.projectId], references: [projects.id] }),
}));

export const chapterImagesRelations = relations(chapterImages, ({ one }) => ({
  project: one(projects, { fields: [chapterImages.projectId], references: [projects.id] }),
}));

export const briefsRelations = relations(briefs, ({ one }) => ({
  project: one(projects, { fields: [briefs.projectId], references: [projects.id] }),
}));

export const continuityProposalsRelations = relations(continuityProposals, ({ one }) => ({
  project: one(projects, { fields: [continuityProposals.projectId], references: [projects.id] }),
}));
