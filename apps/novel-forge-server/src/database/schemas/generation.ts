/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { contentGenerator, projects } from './projects';

/**
 * Defining types
 */

export namespace Generation {
  export type Draft = InferSelectModel<typeof drafts>;
  export type Brief = InferSelectModel<typeof briefs>;
  export type ContinuityProposal = InferSelectModel<typeof continuityProposals>;
  export type DraftStatus = InferEnum<typeof draftStatus>;
  export type JudgeVerdict = InferEnum<typeof judgeVerdict>;
  export type ContinuityProposalStatus = InferEnum<typeof continuityProposalStatus>;
  export type DraftReviewStatus = InferEnum<typeof draftReviewStatus>;
}

/**
 * Declaring the constants
 */

export const draftStatus = pgEnum('draft_status', ['draft', 'final']);
export const judgeVerdict = pgEnum('judge_verdict', ['consistent', 'contradiction']);
export const continuityProposalStatus = pgEnum('continuity_proposal_status', ['pending', 'applied', 'discarded']);
export const draftReviewStatus = pgEnum('draft_review_status', ['generating', 'needs_review', 'contradiction', 'approved', 'final']);

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
    state: jsonb('state'),
    generator: contentGenerator('generator').notNull().default('standard'),
    judge: judgeVerdict('judge'),
    judgeNote: text('judge_note'),
    reviewStatus: draftReviewStatus('review_status').notNull().default('generating'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('drafts_project_id_chapter_unique').on(t.projectId, t.chapter)],
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
    contextRefs: jsonb('context_refs'),
    endingContract: jsonb('ending_contract'),
    revision: integer('revision').notNull().default(1),
    contentHash: varchar('content_hash'),
    staleReason: varchar('stale_reason'),
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
    proposal: jsonb('proposal').notNull(),
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

export const briefsRelations = relations(briefs, ({ one }) => ({
  project: one(projects, { fields: [briefs.projectId], references: [projects.id] }),
}));

export const continuityProposalsRelations = relations(continuityProposals, ({ one }) => ({
  project: one(projects, { fields: [continuityProposals.projectId], references: [projects.id] }),
}));
