import { and, eq, gt, ne } from 'drizzle-orm';

import { type PrimaryDatabase, schema } from '@server/database';

export type DraftWriter = Pick<PrimaryDatabase, 'update'>;

/**
 * A drafted chapter is written against its predecessor's prose and continuation state, so mutating
 * chapter N leaves every later non-final draft resting on content that no longer exists. Flag them
 * and revoke any approval that was granted against the superseded ancestor.
 */
export async function markDescendantDraftsStale(db: DraftWriter, projectId: bigint, chapter: number, reason: string): Promise<void> {
  const descendants = and(eq(schema.drafts.projectId, projectId), gt(schema.drafts.chapter, chapter), ne(schema.drafts.status, 'final'));

  await db.update(schema.drafts).set({ staleReason: reason, updatedAt: new Date() }).where(descendants);
  await db
    .update(schema.drafts)
    .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
    .where(and(descendants, eq(schema.drafts.reviewStatus, 'approved')));
}
