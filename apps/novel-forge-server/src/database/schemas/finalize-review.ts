import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { drafts } from './generation';
import { jobs } from './jobs';
import { jsonb } from './jsonb';
import { projects } from './projects';

/** One row an applied item changed, as it was before and after, so the kept set can be put back as one unit. */
export interface FinalizeReviewRowChange {
  table: string;
  match: Record<string, string | number>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface FinalizeReviewAppliedItem {
  itemId: string;
  changes: FinalizeReviewRowChange[];
}

export namespace FinalizeReview {
  export type Row = InferSelectModel<typeof finalizeReviews>;
  export type Item = InferSelectModel<typeof finalizeReviewItems>;
  export type Status = InferEnum<typeof finalizeReviewStatus>;
  export type Category = InferEnum<typeof finalizeReviewCategory>;
  export type Triage = InferEnum<typeof finalizeReviewTriage>;
  export type Basis = InferEnum<typeof finalizeReviewBasis>;
  export type Decision = InferEnum<typeof finalizeReviewDecision>;
  export type Flag = InferEnum<typeof finalizeReviewFlag>;
}

export const finalizeReviewStatus = pgEnum('finalize_review_status', ['preparing', 'ready', 'failed', 'applied', 'reverted']);
export const finalizeReviewCategory = pgEnum('finalize_review_category', [
  'entity',
  'appearance',
  'character_state',
  'relationship',
  'promise',
  'knowledge',
  'milestone',
  'summary',
]);
export const finalizeReviewTriage = pgEnum('finalize_review_triage', ['consequential', 'routine']);
export const finalizeReviewBasis = pgEnum('finalize_review_basis', ['observed', 'inferred']);
export const finalizeReviewDecision = pgEnum('finalize_review_decision', ['kept', 'edited', 'skipped']);
export const finalizeReviewFlag = pgEnum('finalize_review_flag', ['missed_milestone', 'unclaimed_milestone', 'unplanned_disclosure']);

/** The Story Bible updates read out of one approved revision, waiting for the author before finalize applies the kept ones. */
export const finalizeReviews = pgTable(
  'finalize_reviews',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chapter: integer('chapter').notNull(),
    draftId: bigint('draft_id', { mode: 'bigint' }).references(() => drafts.id, { onDelete: 'set null' }),
    draftRevision: integer('draft_revision').notNull(),
    sourceHash: varchar('source_hash').notNull(),
    /** The approved plan's hash: a plan change at the same revision re-prepares the review. */
    planHash: varchar('plan_hash'),
    isolated: boolean('isolated').notNull().default(false),
    /** A final isolated chapter's bridge, read again after an amend: never applied, since an amend does not touch the Story Bible. */
    bridgeOnly: boolean('bridge_only').notNull().default(false),
    status: finalizeReviewStatus('status').notNull().default('preparing'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    error: text('error'),
    applied: jsonb('applied').$type<FinalizeReviewAppliedItem[]>(),
    appliedAt: timestamp('applied_at'),
    revertedAt: timestamp('reverted_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  // One finalize review per revision; a final chapter's bridge may be read again beside it, so bridge-only reviews are not unique.
  t => [
    uniqueIndex('finalize_reviews_project_id_chapter_revision_unique')
      .on(t.projectId, t.chapter, t.draftRevision)
      .where(sql`${t.bridgeOnly} = false`),
    index('finalize_reviews_draft_id_idx').on(t.draftId),
  ],
);

export const finalizeReviewItems = pgTable(
  'finalize_review_items',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    reviewId: bigint('review_id', { mode: 'bigint' })
      .notNull()
      .references(() => finalizeReviews.id, { onDelete: 'cascade' }),
    /** Stable for the same proposed change within a revision, so a re-prepared review keeps the author's answers. */
    itemKey: varchar('item_key').notNull(),
    position: integer('position').notNull(),
    category: finalizeReviewCategory('category').notNull(),
    triage: finalizeReviewTriage('triage').notNull(),
    basis: finalizeReviewBasis('basis').notNull(),
    subjectKey: varchar('subject_key').notNull(),
    claim: text('claim').notNull(),
    evidence: text('evidence'),
    proposed: jsonb('proposed').notNull(),
    edited: jsonb('edited'),
    flag: finalizeReviewFlag('flag'),
    /** What the flag puts at stake, e.g. the reveals this chapter's plan makes that depend on a missed milestone. */
    dependents: jsonb('dependents').$type<string[]>(),
    decision: finalizeReviewDecision('decision'),
    reason: text('reason'),
    autoKept: boolean('auto_kept').notNull().default(false),
    decidedAt: timestamp('decided_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique('finalize_review_items_review_id_item_key_unique').on(t.reviewId, t.itemKey)],
);

export const finalizeReviewsRelations = relations(finalizeReviews, ({ one, many }) => ({
  project: one(projects, { fields: [finalizeReviews.projectId], references: [projects.id] }),
  items: many(finalizeReviewItems),
}));

export const finalizeReviewItemsRelations = relations(finalizeReviewItems, ({ one }) => ({
  review: one(finalizeReviews, { fields: [finalizeReviewItems.reviewId], references: [finalizeReviews.id] }),
}));
