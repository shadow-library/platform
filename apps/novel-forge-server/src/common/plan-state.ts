import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode, RevealRuleError } from '@server/classes';
import { type DbExecutor, schema } from '@server/database';

import { markDescendantDraftsStale, REVEAL_STALE_PREFIX } from './draft-staleness';
import { loadPlanState, type PlanState } from './plan-world';
import { revokeProvisionalReveals } from './provisional-knowledge';
import {
  factPlannedChapters,
  findPlanClaimProblems,
  findPlanRevealViolations,
  findRivalEnding,
  milestonePlanStates,
  planUnlockContexts,
  renderRevealRuleViolations,
  type RevealRuleViolation,
} from './reveal-rule';
import { secretTitle } from './secret-title';
import { isUnlockCondition } from './unlock-condition';

function revealRuleError(errorCode: typeof AppErrorCode.PLN_001, chapter: number, violations: readonly RevealRuleViolation[]): RevealRuleError {
  const details = violations.map(violation => ({ factKey: violation.factKey, label: secretTitle(violation), missing: violation.missing }));
  return new RevealRuleError(errorCode, { chapter, violations: renderRevealRuleViolations(violations) }, details);
}

/**
 * The reveal rule, milestone claims and the single ending, checked on the plans just written as they now stand, then the state
 * derived from every plan brought up to date. Throws before anything derived is written, so the caller's transaction rolls back whole.
 */
export async function enforcePlanWrite(tx: DbExecutor, projectId: bigint, chapters: readonly number[]): Promise<void> {
  const state = await loadPlanState(tx, projectId);
  const contexts = planUnlockContexts(state);
  for (const chapter of [...new Set(chapters)].sort((left, right) => left - right)) {
    const plan = state.plans.find(candidate => candidate.chapter === chapter);
    if (!plan) continue;
    const claimProblems = findPlanClaimProblems(plan, state);
    if (claimProblems.length > 0) throw AppErrorCode.PLN_003.create({ chapter, reason: claimProblems.join('; ') });
    const rivalEnding = findRivalEnding(plan, state);
    if (rivalEnding !== null) throw AppErrorCode.PLN_002.create({ chapter: rivalEnding });
    const violations = findPlanRevealViolations(plan, state.facts, state, contexts.get(plan));
    if (violations.length > 0) throw revealRuleError(AppErrorCode.PLN_001, chapter, violations);
  }
  await reconcilePlanState(tx, projectId, state);
}

/**
 * Approval ledgers a plan's reveals and finalize commits them, so neither may run while the plan reveals what its chapter cannot yet know.
 * A chapter already finalized is history, which lets a resumed finalization through.
 */
export async function assertPlanRevealsHold(tx: DbExecutor, projectId: bigint, chapter: number): Promise<void> {
  const refusal = await planRevealsRefusal(tx, projectId, chapter);
  if (refusal) throw refusal;
}

export async function planRevealsRefusal(tx: DbExecutor, projectId: bigint, chapter: number): Promise<AppError | null> {
  const state = await loadPlanState(tx, projectId);
  const plan = state.plans.find(candidate => candidate.chapter === chapter);
  if (!plan || chapter <= state.frontier) return null;
  const violations = findPlanRevealViolations(plan, state.facts, state);
  return violations.length > 0 ? revealRuleError(AppErrorCode.PLN_004, chapter, violations) : null;
}

/**
 * Brings what plans imply up to date, rows in id order: each unreached milestone's `planned`/`open` state, each fact's provisional
 * `plannedChapter`, and, for an unfinalized plan whose reveal stopped holding because something it relied on changed, the stale mark on
 * the plan and its draft with the draft's approval and ledgered reveals revoked. A mark this function did not set is never touched.
 */
export async function reconcilePlanState(tx: DbExecutor, projectId: bigint, loaded?: PlanState): Promise<void> {
  const state = loaded ?? (await loadPlanState(tx, projectId));
  const contexts = planUnlockContexts(state);
  const now = new Date();

  const milestoneStates = milestonePlanStates(state);
  for (const row of state.milestoneRows) {
    const next = milestoneStates.get(row.milestoneKey);
    if (!next || (next.state === row.state && next.plannedChapter === row.plannedChapter)) continue;
    await tx
      .update(schema.milestones)
      .set({ state: next.state, plannedChapter: next.plannedChapter, updatedAt: now })
      .where(and(eq(schema.milestones.id, row.id), ne(schema.milestones.state, 'reached')));
  }

  const plannedChapters = factPlannedChapters(state.facts, state, contexts);
  for (const fact of state.facts) {
    const plannedChapter = plannedChapters.get(fact.factKey) ?? null;
    if (plannedChapter !== (fact.plannedChapter ?? null)) await tx.update(schema.canonFacts).set({ plannedChapter }).where(eq(schema.canonFacts.id, fact.id));
  }

  const marks = state.plans.flatMap(plan => {
    if (plan.chapter <= state.frontier) return [];
    const violations = findPlanRevealViolations(plan, state.facts, state, contexts.get(plan));
    const reason = violations.length > 0 ? `${REVEAL_STALE_PREFIX}${renderRevealRuleViolations(violations)}` : null;
    const ownMark = plan.staleReason?.startsWith(REVEAL_STALE_PREFIX) ?? false;
    return reason !== null || ownMark ? [{ plan, reason, ownMark }] : [];
  });
  if (marks.length === 0) return;

  const drafts = await tx.query.drafts.findMany({
    columns: { id: true, chapter: true, status: true, reviewStatus: true, staleReason: true },
    where: and(
      eq(schema.drafts.projectId, projectId),
      inArray(
        schema.drafts.chapter,
        marks.map(mark => mark.plan.chapter),
      ),
    ),
  });
  for (const { plan, reason, ownMark } of marks) {
    if ((plan.staleReason === null || ownMark) && reason !== plan.staleReason) await tx.update(schema.briefs).set({ staleReason: reason }).where(eq(schema.briefs.id, plan.id));
    const draft = drafts.find(candidate => candidate.chapter === plan.chapter && candidate.status !== 'final');
    if (!draft) continue;
    if (reason) await markDraftRevealStale(tx, projectId, draft, reason);
    else if (draft.staleReason?.startsWith(REVEAL_STALE_PREFIX))
      await tx
        .update(schema.drafts)
        .set({ staleReason: null, updatedAt: now })
        .where(and(eq(schema.drafts.id, draft.id), eq(schema.drafts.staleReason, draft.staleReason)));
  }
}

interface MarkableDraft {
  id: bigint;
  chapter: number;
  reviewStatus: string;
}

/** An earlier stale reason is kept, as `markDescendantDraftsStale` does; the approval and the reveals it ledgered go either way. */
async function markDraftRevealStale(tx: DbExecutor, projectId: bigint, draft: MarkableDraft, reason: string): Promise<void> {
  const live = and(eq(schema.drafts.id, draft.id), ne(schema.drafts.status, 'final'));
  await tx
    .update(schema.drafts)
    .set({ staleReason: reason, updatedAt: new Date() })
    .where(and(live, isNull(schema.drafts.staleReason)));
  if (draft.reviewStatus !== 'approved') return;
  await tx
    .update(schema.drafts)
    .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
    .where(and(live, eq(schema.drafts.reviewStatus, 'approved')));
  await revokeProvisionalReveals(tx, projectId, draft.chapter);
  await markDescendantDraftsStale(tx, projectId, draft.chapter, `ancestor chapter ${draft.chapter} lost its approval`);
}

/** A milestone's subject is a character of the novel, named by its entity key. */
export async function assertMilestoneSubject(db: Pick<DbExecutor, 'query'>, projectId: bigint, entityKey: string): Promise<void> {
  const entity = await db.query.entities.findFirst({ columns: { id: true }, where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) });
  if (!entity) throw AppErrorCode.MIL_004.create({ entityKey });
}

/** What would dangle if the milestone went: plans that claim it and facts whose unlock names it. */
export async function findMilestoneReferences(db: DbExecutor, projectId: bigint, milestoneKey: string): Promise<string[]> {
  const briefs = await db.query.briefs.findMany({ columns: { chapter: true, claimedMilestones: true }, where: eq(schema.briefs.projectId, projectId) });
  const facts = await db.query.canonFacts.findMany({ columns: { factKey: true, unlock: true }, where: eq(schema.canonFacts.projectId, projectId) });
  const claiming = briefs
    .filter(brief => (brief.claimedMilestones ?? []).includes(milestoneKey))
    .map(brief => brief.chapter)
    .sort((left, right) => left - right)
    .map(chapter => `the plan for chapter ${chapter}`);
  const unlocking = facts
    .filter(fact => isUnlockCondition(fact.unlock) && fact.unlock.all.some(term => 'milestone' in term && term.milestone === milestoneKey))
    .map(fact => `the unlock of fact ${fact.factKey}`)
    .sort();
  return [...claiming, ...unlocking];
}

/** Finalizing a chapter reaches the milestones its plan claims, bound to the approved revision that was committed. */
export async function reachClaimedMilestones(tx: DbExecutor, projectId: bigint, chapter: number, boundRevision: number): Promise<void> {
  const brief = await tx.query.briefs.findFirst({
    columns: { claimedMilestones: true },
    where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)),
  });
  const claimed = brief?.claimedMilestones ?? [];
  if (claimed.length === 0) return;
  await tx
    .update(schema.milestones)
    .set({ state: 'reached', plannedChapter: chapter, reachedChapter: chapter, boundRevision, updatedAt: new Date() })
    .where(and(eq(schema.milestones.projectId, projectId), inArray(schema.milestones.milestoneKey, claimed), ne(schema.milestones.state, 'reached')));
}
