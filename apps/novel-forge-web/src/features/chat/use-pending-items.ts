import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  draftQueryOptions,
  type DraftResponse,
  useContinuityProposalsQuery,
  useDraftSummaryQuery,
  useFinalizeReviewsQuery,
  useListPluginsQuery,
  useListProposalsQuery,
} from '@/lib/apis';
import { type PendingItem, pendingItems, type PendingTray, pendingTray } from '@/lib/pending-items';

// Matches the shell's own pending-proposal query, so the chat reads that cache rather than issuing a second request for the same rows.
export const PENDING_PROPOSAL_LIMIT = 50;

const NEEDS_READ: ReadonlySet<string> = new Set(['needs_review', 'contradiction']);

export interface PendingWork {
  items: PendingItem[];
  /** The card list has loaded, so a card missing from the items is not waiting on anyone. */
  ready: boolean;
  tray: PendingTray;
  /** The drafts waiting on the author's read, in full for their cards; the summary finds them without loading every chapter's prose. */
  drafts: DraftResponse[];
}

/** Everything waiting on the author across the novel, read from the queries the chat already holds, and which of it this chat's thread shows. */
export function usePendingItems(novelId: string, sessionId: string | undefined, shownProposals: ReadonlySet<string>): PendingWork {
  const summary = useDraftSummaryQuery(novelId);
  const proposals = useListProposalsQuery(novelId, { status: 'pending', limit: PENDING_PROPOSAL_LIMIT });
  const continuity = useContinuityProposalsQuery(novelId);
  const reviews = useFinalizeReviewsQuery(novelId);
  const hasPlugin = (proposals.data?.items ?? []).some(proposal => proposal.kind === 'plugin');
  const plugins = useListPluginsQuery(hasPlugin);

  const waiting = useMemo(() => (summary.data?.items ?? []).filter(draft => NEEDS_READ.has(draft.reviewStatus)), [summary.data]);
  const details = useQueries({
    queries: waiting.map(draft => ({ ...draftQueryOptions(novelId, draft.chapter), enabled: Boolean(novelId) })),
    combine: results => results.flatMap(result => (result.data && NEEDS_READ.has(result.data.reviewStatus) ? [result.data] : [])),
  });

  const items = useMemo(
    () =>
      pendingItems({
        sessionId,
        drafts: waiting,
        decisions: reviews.data?.waiting ?? [],
        settling: reviews.data?.settling ?? [],
        continuity: continuity.data?.items ?? [],
        proposals: proposals.data?.items ?? [],
        shownProposals,
        pluginTitles: new Map((plugins.data ?? []).map(manifest => [manifest.id, manifest.title])),
      }),
    [sessionId, waiting, reviews.data, continuity.data, proposals.data, shownProposals, plugins.data],
  );
  const tray = useMemo(() => pendingTray(items), [items]);
  return { items, ready: proposals.isSuccess, tray, drafts: details };
}
