import { and, eq, gt, ne, sql } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';

import { type KnowledgeLedger, revokeProvisionalReveals } from './provisional-knowledge';

export type DraftWriter = Pick<PrimaryDatabase, 'update'> & KnowledgeLedger;

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
