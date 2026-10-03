import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { workflowRuns } from './ai';
import { jsonb } from './jsonb';
import { contentMode, costTier, projects } from './projects';

export type ReviewFindingSeverity = 'blocking' | 'warning' | 'note';
export type ReviewFindingCategory = 'continuity' | 'brief' | 'ending' | 'knowledge' | 'readability' | 'mechanics' | 'editorial' | 'proofreading';

export interface ChapterReviewFinding {
  /** Stable within its review; remedies address a finding by it. */
  id: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  text: string;
  /** A passage quoted verbatim from the reviewed prose; null when the finding quoted nothing that is actually in it. */
  evidence: string | null;
  /** The same finding raised again on the same prose hashes the same, which is how a remedy is remembered across runs. */
  fingerprint: string;
}

export interface ChapterReviewCompliance {
  compliant: boolean;
  issues: string[];
}

export namespace Review {
  export type ChapterReview = InferSelectModel<typeof chapterReviews>;
  export type Remedy = InferSelectModel<typeof chapterReviewRemedies>;
  export type Kind = InferEnum<typeof chapterReviewKind>;
  export type Disposition = InferEnum<typeof chapterReviewDisposition>;
  export type RemedyAction = InferEnum<typeof reviewRemedyAction>;
}

export const chapterReviewKind = pgEnum('chapter_review_kind', ['judge', 'editorial', 'mechanics', 'readability']);
export const chapterReviewDisposition = pgEnum('chapter_review_disposition', ['clear', 'issues', 'blocking', 'failed']);
export const reviewRemedyAction = pgEnum('review_remedy_action', ['dismissed', 'fixing_myself', 'overridden']);

export const chapterReviews = pgTable(
  'chapter_reviews',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    // Null when the chapter has no draft row (finalized prose landed by an import); the body hash then decides staleness alone.
    draftRevision: integer('draft_revision'),
    bodyHash: varchar('body_hash').notNull(),
    // The reviewed chapter was isolated or written unrestricted, so its findings and evidence quote prose standard models must not read.
    isolated: boolean('isolated').notNull().default(false),
    kind: chapterReviewKind('kind').notNull(),
    disposition: chapterReviewDisposition('disposition').notNull(),
    // The model's own verdict word ('consistent', 'revision_requested', …); null for the deterministic kinds.
    verdict: varchar('verdict'),
    note: text('note'),
    findings: jsonb('findings').$type<ChapterReviewFinding[]>().notNull(),
    checked: jsonb('checked').$type<string[]>().notNull(),
    briefCompliance: jsonb('brief_compliance').$type<ChapterReviewCompliance>(),
    readabilityCompliance: jsonb('readability_compliance').$type<ChapterReviewCompliance>(),
    endingCompliance: jsonb('ending_compliance').$type<ChapterReviewCompliance>(),
    knowledgeCompliance: jsonb('knowledge_compliance').$type<ChapterReviewCompliance>(),
    metrics: jsonb('metrics').$type<Record<string, number>>(),
    runId: uuid('run_id').references(() => workflowRuns.id, { onDelete: 'set null' }),
    costTier: costTier('cost_tier'),
    contentMode: contentMode('content_mode'),
    modelProvider: varchar('model_provider'),
    model: varchar('model'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('chapter_reviews_project_id_chapter_kind_idx').on(t.projectId, t.chapter, t.kind, t.createdAt), index('chapter_reviews_run_id_idx').on(t.runId)],
);

export const chapterReviewRemedies = pgTable(
  'chapter_review_remedies',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    reviewId: bigint('review_id', { mode: 'bigint' })
      .notNull()
      .references(() => chapterReviews.id, { onDelete: 'cascade' }),
    findingId: varchar('finding_id').notNull(),
    fingerprint: varchar('fingerprint').notNull(),
    action: reviewRemedyAction('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('chapter_review_remedies_review_id_finding_id_unique').on(t.reviewId, t.findingId)],
);

export const chapterReviewsRelations = relations(chapterReviews, ({ one, many }) => ({
  project: one(projects, { fields: [chapterReviews.projectId], references: [projects.id] }),
  remedies: many(chapterReviewRemedies),
}));

export const chapterReviewRemediesRelations = relations(chapterReviewRemedies, ({ one }) => ({
  review: one(chapterReviews, { fields: [chapterReviewRemedies.reviewId], references: [chapterReviews.id] }),
}));
