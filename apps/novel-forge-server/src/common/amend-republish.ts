import { and, desc, eq } from 'drizzle-orm';

import { type DbExecutor, type Publishing, schema } from '@server/database';

type AmendRepublishSkipReason = 'never-published' | 'unpublished' | 'unchanged';

export type AmendRepublishDecision = { republish: true; revision: number } | { republish: false; reason: AmendRepublishSkipReason };

export type AmendLedgerRow = Pick<Publishing.ChapterPublication, 'revision' | 'contentHash' | 'status'>;

/** The reader-facing fields a republish carries over; structurally the part of `ReaderChapterPayload` the ledger stores. */
export interface AmendRepublishPayload {
  title: string;
  authorNote?: string;
  contentHash: string;
}

/**
 * Decides whether amending a finalized chapter's prose owes the reader a republish. The rendered
 * `contentHash` is the only signal: an amendment that leaves it where it was is invisible past the
 * publish boundary, and rescheduling on it would churn every reader's feed for nothing.
 *
 * An `unpublished` row is left completely alone — status is the author's withdrawal decision, and
 * scheduling it would push a chapter back to readers who were meant to lose it. Its stale
 * `contentHash` is deliberate too: a later `publishChapter` compares against it and sees the move.
 */
export function decideAmendRepublish(ledger: AmendLedgerRow | null, contentHash: string): AmendRepublishDecision {
  if (!ledger) return { republish: false, reason: 'never-published' };
  if (ledger.status === 'unpublished') return { republish: false, reason: 'unpublished' };
  if (ledger.contentHash === contentHash) return { republish: false, reason: 'unchanged' };
  return { republish: true, revision: ledger.revision + 1 };
}

/**
 * Applies that decision to the ledger. Shared by every path that rewrites finalized prose in place —
 * the amend endpoint and the translation finalize — so the two can never drift on what a republish means.
 *
 * `publishedOrdinal` is absent from the set clause on purpose: it is the reader's URL, frozen the moment
 * the chapter first published.
 */
export async function applyAmendRepublish(tx: DbExecutor, projectId: bigint, chapter: number, payload: AmendRepublishPayload): Promise<AmendRepublishDecision> {
  const ledger = await tx.query.chapterPublications.findFirst({
    where: and(eq(schema.chapterPublications.projectId, projectId), eq(schema.chapterPublications.chapter, chapter)),
    orderBy: desc(schema.chapterPublications.publishedOrdinal),
  });

  const decision = decideAmendRepublish(ledger ?? null, payload.contentHash);
  if (!ledger || !decision.republish) return decision;

  await tx
    .update(schema.chapterPublications)
    .set({
      title: payload.title,
      authorNote: payload.authorNote ?? null,
      contentHash: payload.contentHash,
      revision: decision.revision,
      status: 'scheduled',
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.chapterPublications.id, ledger.id));

  return decision;
}
