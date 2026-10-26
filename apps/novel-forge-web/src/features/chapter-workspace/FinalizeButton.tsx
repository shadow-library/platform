import { useState } from 'react';
import { Button } from '@shadow-library/ui';

import { useDraftQuery, useDraftSummaryQuery, useFinalizeReviewQuery } from '@/lib/apis';
import { latestFinalChapter, storyBibleUpdatesLabel } from '@/lib/finalize-review';

import { FinalizeReviewDialog } from './FinalizeReviewDialog';

export interface FinalizeButtonProps {
  novelId: string;
  chapter: number;
}

/** Finalize always goes through the review of what the approved chapter changes in the Story Bible; nothing finalizes from the header directly. */
export function FinalizeButton({ novelId, chapter }: FinalizeButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        Finalize · review Story Bible updates
      </Button>
      <FinalizeReviewDialog novelId={novelId} chapter={chapter} open={open} onOpenChange={setOpen} canRevert={false} />
    </>
  );
}

/**
 * A final chapter's review that still needs the author, or an unrestricted chapter's bridge, which stays; a standard chapter's button is absent
 * once its review wrote the Story Bible (its Undo lives on the chat's receipt) and when it was finalized before reviews existed.
 */
export function StoryBibleUpdatesButton({ novelId, chapter }: FinalizeButtonProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const review = useFinalizeReviewQuery(novelId, chapter);
  const draft = useDraftQuery(novelId, chapter);
  const summary = useDraftSummaryQuery(novelId, open);
  const label = storyBibleUpdatesLabel(review.data, draft.data?.isolated === true);
  if (!label) return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FinalizeReviewDialog novelId={novelId} chapter={chapter} open={open} onOpenChange={setOpen} canRevert={latestFinalChapter(summary.data?.items) === chapter} />
    </>
  );
}
