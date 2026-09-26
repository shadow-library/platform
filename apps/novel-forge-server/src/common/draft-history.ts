import { and, eq, lt, ne } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';

/**
 * How many of a draft's newest revisions keep their prose in `draft_revisions`. An autosave folds into the revision it continues, so a
 * revision is an editing session, a generation, a revise, a passage rewrite or a restore — fifty covers a chapter's working life without
 * the table growing with every draft ever written. The approved revision is kept beyond the window so "changed since you approved" can compare.
 */
export const DRAFT_HISTORY_LIMIT = 50;

export interface HistoryHead {
  id: bigint;
  revision: number;
  approvedRevision: number | null;
}

/** Runs in the transaction that recorded the draft's newest revision. */
export async function pruneDraftHistory(tx: Pick<PrimaryDatabase, 'delete'>, draft: HistoryHead): Promise<void> {
  const oldestKept = draft.revision - DRAFT_HISTORY_LIMIT + 1;
  if (oldestKept <= 0) return;
  const revisions = schema.draftRevisions;
  const approved = draft.approvedRevision === null ? undefined : ne(revisions.revision, draft.approvedRevision);
  await tx.delete(revisions).where(and(eq(revisions.draftId, draft.id), lt(revisions.revision, oldestKept), approved));
}
