import { type Publishing } from '@server/database';

export type AmendRepublishSkipReason = 'never-published' | 'unpublished' | 'unchanged';

export type AmendRepublishDecision = { republish: true; revision: number } | { republish: false; reason: AmendRepublishSkipReason };

export type AmendLedgerRow = Pick<Publishing.ChapterPublication, 'revision' | 'contentHash' | 'status'>;

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
