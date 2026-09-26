import { and, asc, eq } from 'drizzle-orm';
import { type AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { learnedFactKeys, loadPlanState, planUnlockContext, reconcilePlanState, revealRequirements } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type FinalizeReview, type FinalizeReviewAppliedItem, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { hashReviewedBody } from '../review/review-findings';
import { effectiveChange, openItems } from './finalize-review-items';
import { applyKeptItems, dbChangeApplier, drizzleRowStore } from './review-event-apply';

export interface ReviewedRevision {
  revision: number;
  body: string;
}

export type ReviewWithItems = FinalizeReview.Row & { items: FinalizeReview.Item[] };

type ReviewReader = Pick<PrimaryDatabase, 'query'>;

const logger = Logger.getLogger(APP_NAME, 'finalize-review-gate');

/** Whether the review still describes the prose as it stands: an edit after approval moves the revision or the body and invalidates it. */
export function isReviewCurrent(review: Pick<FinalizeReview.Row, 'draftRevision' | 'sourceHash'>, draft: ReviewedRevision): boolean {
  return review.draftRevision === draft.revision && review.sourceHash === hashReviewedBody(draft.body);
}

type MilestoneItem = Pick<FinalizeReview.Item, 'category' | 'flag' | 'decision' | 'proposed' | 'edited' | 'subjectKey' | 'dependents'>;

/** The milestones this chapter's plan claims that the author's answers leave unreached: a skip, or a keep or edit of "not reached". */
export function unreachedClaims<T extends MilestoneItem>(items: readonly T[]): T[] {
  return items.filter(item => {
    if (item.category !== 'milestone' || item.flag === 'unclaimed_milestone') return false;
    const change = effectiveChange(item);
    return item.decision === 'skipped' || (change.category === 'milestone' && !change.reached);
  });
}

/** A claimed milestone left unreached while this chapter's plan reveals something that needs it. */
export function strandedReveals(items: readonly MilestoneItem[]): { milestone: string; facts: string[] } | null {
  const stranded = unreachedClaims(items).find(item => item.dependents?.length);
  return stranded ? { milestone: stranded.subjectKey, facts: stranded.dependents ?? [] } : null;
}

/**
 * Why finalize must refuse this revision's review, or null when it may apply it. `reviews` are every review the chapter has: none at all means
 * the chapter was approved before reviews existed and finalizes on the direct continuity path.
 */
export function reviewRefusal(reviews: readonly ReviewWithItems[], draft: ReviewedRevision): AppError | null {
  if (reviews.length === 0) return null;
  const review = reviews.find(candidate => !candidate.bridgeOnly && candidate.draftRevision === draft.revision);
  if (!review || !isReviewCurrent(review, draft)) return AppErrorCode.FRV_004.create();
  if (review.status === 'applied' || review.status === 'reverted') return null;
  if (review.status === 'preparing') return AppErrorCode.FRV_002.create();
  if (review.status === 'failed') return AppErrorCode.FRV_003.create();
  const open = openItems(review.items).length;
  if (open > 0) return AppErrorCode.FRV_005.create({ count: String(open) });
  const stranded = strandedReveals(review.items);
  if (stranded) return AppErrorCode.FRV_006.create({ milestone: stranded.milestone, facts: stranded.facts.join(', ') });
  return null;
}

export async function loadChapterReviews(db: ReviewReader, projectId: bigint, chapter: number): Promise<ReviewWithItems[]> {
  return db.query.finalizeReviews.findMany({
    where: and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter)),
    with: { items: { orderBy: asc(schema.finalizeReviewItems.position) } },
  });
}

/** The entities a chapter's applied review created or showed, for the lore index the direct path feeds from its delta. */
export async function reviewedEntityKeys(db: ReviewReader, projectId: bigint, chapter: number): Promise<string[]> {
  const applied = (await loadChapterReviews(db, projectId, chapter)).find(review => review.status === 'applied');
  if (applied?.isolated) return [];
  const keys = (applied?.items ?? [])
    .filter(item => item.decision === 'kept' || item.decision === 'edited')
    .map(item => effectiveChange(item))
    .flatMap(change => (change.category === 'entity' ? [change.entity.entityKey] : change.category === 'appearance' ? [change.entityKey] : []));
  return [...new Set(keys)];
}

/** A claim a final chapter did not reach would keep counting as reached for every later plan, and block any later plan from claiming it. */
export async function dropBriefClaims(tx: PrimaryTransaction, projectId: bigint, chapter: number, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const briefWhere = and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter));
  const brief = await tx.query.briefs.findFirst({ columns: { claimedMilestones: true }, where: briefWhere });
  const remaining = (brief?.claimedMilestones ?? []).filter(key => !keys.includes(key));
  if (remaining.length === (brief?.claimedMilestones ?? []).length) return;
  await tx
    .update(schema.briefs)
    .set({ claimedMilestones: remaining.length > 0 ? remaining : null })
    .where(briefWhere);
}

/** The milestones an applied review reached, read from the rows it logged. */
export function revertedMilestoneKeys(applied: readonly FinalizeReviewAppliedItem[]): string[] {
  return applied.flatMap(item =>
    item.changes.flatMap(change => (change.table === 'milestones' && change.after?.['state'] === 'reached' ? [String(change.match['milestoneKey'])] : [])),
  );
}

/**
 * The reveals a final chapter made that hold now but would not once a revert un-reaches `milestones`: the chapter's committed prose keeps
 * revealing them, while the milestone would go back to open and a later plan could claim it after its secret is out.
 */
export async function revealsStrandedByRevert(
  db: DbExecutor,
  projectId: bigint,
  chapter: number,
  milestones: readonly string[],
): Promise<{ milestone: string; facts: string[] } | null> {
  if (milestones.length === 0) return null;
  const undone = new Set(milestones);
  const [state, disclosed] = await Promise.all([
    loadPlanState(db, projectId),
    db.query.canonFacts.findMany({
      columns: { factKey: true },
      where: and(eq(schema.canonFacts.projectId, projectId), eq(schema.canonFacts.disclosedInChapter, chapter)),
    }),
  ]);
  const plan = state.plans.find(candidate => candidate.chapter === chapter) ?? { chapter, volumeKey: null, isEnding: false, claimedMilestones: [], knowledgeContract: null };
  const reverted = {
    ...state,
    plans: state.plans.map(candidate =>
      candidate.chapter === chapter ? { ...candidate, claimedMilestones: (candidate.claimedMilestones ?? []).filter(key => !undone.has(key)) } : candidate,
    ),
    milestones: state.milestones.map(milestone => (undone.has(milestone.milestoneKey) ? { ...milestone, state: 'open' as const, reachedChapter: null } : milestone)),
  };
  const now = planUnlockContext(plan, state);
  const after = planUnlockContext(reverted.plans.find(candidate => candidate.chapter === chapter) ?? plan, reverted);
  const revealed = new Set([...learnedFactKeys(plan.knowledgeContract), ...disclosed.map(fact => fact.factKey)]);
  const facts = state.facts.filter(fact => revealed.has(fact.factKey) && revealRequirements(fact, now).length === 0 && revealRequirements(fact, after).length > 0);
  return facts.length > 0 ? { milestone: milestones.join(', '), facts: facts.map(fact => fact.factKey) } : null;
}

export interface ReviewCommit {
  projectId: bigint;
  chapter: number;
  draftRevision: number;
  prose: string;
}

/**
 * Finalize's half of the review, inside the commit transaction after the project plan lock: the review row is locked, re-verified against the
 * prose being committed, and its kept items applied with their inverses recorded. Returns false when the chapter has no review and continuity
 * takes the direct path; a review applied by an earlier attempt of the same finalize is not applied twice.
 */
export async function applyReviewOnCommit(tx: PrimaryTransaction, commit: ReviewCommit): Promise<boolean> {
  const locked = await tx
    .select({ id: schema.finalizeReviews.id })
    .from(schema.finalizeReviews)
    .where(and(eq(schema.finalizeReviews.projectId, commit.projectId), eq(schema.finalizeReviews.chapter, commit.chapter)))
    .for('update');
  if (locked.length === 0) return false;

  const reviews = await loadChapterReviews(tx, commit.projectId, commit.chapter);
  const refusal = reviewRefusal(reviews, { revision: commit.draftRevision, body: commit.prose });
  if (refusal) throw refusal;
  const review = reviews.find(candidate => !candidate.bridgeOnly && candidate.draftRevision === commit.draftRevision) as ReviewWithItems;
  if (review.status !== 'ready') return true;

  const kept = review.items.filter(item => item.decision === 'kept' || item.decision === 'edited');
  const target = { projectId: commit.projectId, chapter: commit.chapter, draftRevision: commit.draftRevision };
  const applied = await applyKeptItems(drizzleRowStore(tx), dbChangeApplier(tx, target), kept);
  // A claim the prose missed would otherwise keep counting as reached for every later plan, and block any later plan from claiming it.
  await dropBriefClaims(
    tx,
    commit.projectId,
    commit.chapter,
    unreachedClaims(review.items).map(item => item.subjectKey),
  );
  await reconcilePlanState(tx, commit.projectId);
  await tx.update(schema.finalizeReviews).set({ status: 'applied', applied, appliedAt: new Date(), updatedAt: new Date() }).where(eq(schema.finalizeReviews.id, review.id));
  await tx
    .update(schema.chapters)
    .set({ continuityApplied: true, updatedAt: new Date() })
    .where(and(eq(schema.chapters.projectId, commit.projectId), eq(schema.chapters.number, commit.chapter)));
  logger.info('finalize review applied', {
    projectId: commit.projectId,
    chapter: commit.chapter,
    reviewId: review.id,
    kept: kept.length,
    skipped: review.items.length - kept.length,
  });
  return true;
}
