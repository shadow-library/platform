import { useState } from 'react';
import { Button } from '@shadow-library/ui';

import { useDraftSummaryQuery, useFinalizeReviewQuery } from '@/lib/apis';
import { latestFinalChapter } from '@/lib/finalize-review';

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

/** A final chapter's applied review, with Undo while it is the latest final chapter; absent for chapters finalized before reviews existed. */
export function StoryBibleUpdatesButton({ novelId, chapter }: FinalizeButtonProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const review = useFinalizeReviewQuery(novelId, chapter);
  const summary = useDraftSummaryQuery(novelId, open);
  if (!review.data) return null;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Story Bible updates
      </Button>
      <FinalizeReviewDialog novelId={novelId} chapter={chapter} open={open} onOpenChange={setOpen} canRevert={latestFinalChapter(summary.data?.items) === chapter} />
    </>
  );
}
