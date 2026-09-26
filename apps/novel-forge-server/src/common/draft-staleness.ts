import { and, eq, gt, ne, sql } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';

import { parseKnowledgeContract } from './knowledge-contract';
import { type KnowledgeLedger, revokeProvisionalReveals } from './provisional-knowledge';

export type DraftWriter = Pick<PrimaryDatabase, 'update'> & KnowledgeLedger;

/** The parts of a plan its approval ledgers from or finalize reaches: what the chapter teaches and the milestones it claims. */
export interface ApprovedPlanTerms {
  knowledgeContract?: unknown;
  claimedMilestones?: readonly string[] | null;
}

const setKey = (values: readonly string[]): string => JSON.stringify([...new Set(values)].sort());

const learnsKey = (plan: ApprovedPlanTerms | undefined): string =>
  setKey((parseKnowledgeContract(plan?.knowledgeContract)?.learns ?? []).map(reveal => `${reveal.entityKey}→${reveal.factKey}`));

/**
 * An approval ledgered the plan it was given and finalize reaches what that plan claims, so a plan edit that changes what the chapter
 * teaches or claims resets the approval of the chapter's unfinalized draft and revokes what it ledgered. Only a change to what it teaches
 * marks later drafts stale: they were written against what the cast knows, not against the milestones. Call it in the plan write's
 * transaction, under the project plan lock.
 */
export async function resetApprovalForPlanChange(
  db: DraftWriter,
  projectId: bigint,
  chapter: number,
  before: ApprovedPlanTerms | undefined,
  after: ApprovedPlanTerms,
): Promise<void> {
  const learnsChanged = learnsKey(before) !== learnsKey(after);
  if (!learnsChanged && setKey(before?.claimedMilestones ?? []) === setKey(after.claimedMilestones ?? [])) return;
  const reset = await db
    .update(schema.drafts)
    .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
    .where(and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter), ne(schema.drafts.status, 'final'), eq(schema.drafts.reviewStatus, 'approved')))
    .returning({ chapter: schema.drafts.chapter });
  if (reset.length === 0) return;
  await revokeProvisionalReveals(db, projectId, chapter);
  if (learnsChanged) await markDescendantDraftsStale(db, projectId, chapter, `ancestor chapter ${chapter}'s plan changed what its cast learns after approval`);
}

/**
 * A drafted chapter is written against its predecessor's prose and continuation state, so mutating
 * chapter N leaves every later non-final draft resting on content that no longer exists. Flag them
 * and revoke any approval that was granted against the superseded ancestor, with the reveals it ledgered.
 */
export async function markDescendantDraftsStale(db: DraftWriter, projectId: bigint, chapter: number, reason: string): Promise<void> {
  const descendants = and(eq(schema.drafts.projectId, projectId), gt(schema.drafts.chapter, chapter), ne(schema.drafts.status, 'final'));

  // An earlier, more specific reason is kept: it names the change the draft actually rests on.
  await db
    .update(schema.drafts)
    .set({ staleReason: sql`coalesce(${schema.drafts.staleReason}, ${reason})`, updatedAt: new Date() })
    .where(descendants);
  const reset = await db
    .update(schema.drafts)
    .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
    .where(and(descendants, eq(schema.drafts.reviewStatus, 'approved')))
    .returning({ chapter: schema.drafts.chapter });
  await revokeProvisionalReveals(
    db,
    projectId,
    reset.map(draft => draft.chapter),
  );
}
