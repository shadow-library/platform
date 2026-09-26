import { and, eq } from 'drizzle-orm';
import { AppError } from '@shadow-library/common';

import { briefContentHash } from '@server/common';
import { type PrimaryTransaction, schema } from '@server/database';

import { hashReviewedBody } from '../review/review-findings';

export const FINALIZE_REVIEW_JOB_TARGET = (chapter: number): string => `chapter-${chapter}`;

export interface ApprovedRevision {
  id: bigint;
  projectId: bigint;
  chapter: number;
  revision: number;
  body: string;
  isolated: boolean;
}

export interface StagedReview {
  reviewId: bigint;
  needsPrepare: boolean;
}

/**
 * Called in the approval's transaction: binds a review to the exact revision, prose and plan the author approved. Re-approving the same
 * revision with the same prose and plan keeps the review and every answer on it; anything else sends it back to be prepared, and the
 * prepare job carries answers over by item.
 */
export async function stageFinalizeReview(tx: PrimaryTransaction, approved: ApprovedRevision): Promise<StagedReview> {
  const brief = await tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, approved.projectId), eq(schema.briefs.chapter, approved.chapter)) });
  const bound = {
    draftId: approved.id,
    sourceHash: hashReviewedBody(approved.body),
    planHash: brief ? briefContentHash(brief) : null,
    isolated: approved.isolated,
    bridgeOnly: false,
  };
  const [inserted] = await tx
    .insert(schema.finalizeReviews)
    .values({ projectId: approved.projectId, chapter: approved.chapter, draftRevision: approved.revision, ...bound, status: 'preparing' })
    .onConflictDoNothing()
    .returning({ id: schema.finalizeReviews.id });
  if (inserted) return { reviewId: inserted.id, needsPrepare: true };

  const where = and(
    eq(schema.finalizeReviews.projectId, approved.projectId),
    eq(schema.finalizeReviews.chapter, approved.chapter),
    eq(schema.finalizeReviews.draftRevision, approved.revision),
    eq(schema.finalizeReviews.bridgeOnly, false),
  );
  const [existing] = await tx.select().from(schema.finalizeReviews).where(where).for('update');
  if (!existing) throw AppError.internal(`[stageFinalizeReview] The review of chapter ${approved.chapter} vanished after its insert conflicted`);
  const unchanged = existing.sourceHash === bound.sourceHash && existing.planHash === bound.planHash && existing.isolated === bound.isolated;
  if (unchanged && existing.status !== 'failed') return { reviewId: existing.id, needsPrepare: existing.status === 'preparing' };
  await tx
    .update(schema.finalizeReviews)
    .set({ ...bound, status: 'preparing', error: null, updatedAt: new Date() })
    .where(eq(schema.finalizeReviews.id, existing.id));
  return { reviewId: existing.id, needsPrepare: true };
}
