import { useState } from 'react';
import { Button, ConfirmDialog, toast } from '@shadow-library/ui';

import { StatusChip } from '@/components/nf';
import { type FinalizeReviewResponse, useRevertFinalizeReviewMutation } from '@/lib/apis';
import { categoryLabel, receiptLine, receiptTitle, storyBibleReceipt } from '@/lib/finalize-review';

import styles from './Chat.module.css';

export interface StoryBibleReceiptCardProps {
  novelId: string;
  review: FinalizeReviewResponse;
  /** Only the latest final chapter's updates can be undone; the server refuses any other. */
  undoable: boolean;
  onHide: () => void;
}

/** What finalizing a chapter wrote to the Story Bible, with one Undo for the whole set while it is the latest final chapter. */
export function StoryBibleReceiptCard({ novelId, review, undoable, onHide }: StoryBibleReceiptCardProps): React.JSX.Element {
  const revert = useRevertFinalizeReviewMutation(novelId, review.chapter);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const { added, automatic } = storyBibleReceipt(review);
  const canUndo = undoable && added.length > 0;

  const undo = (): void => {
    setRefusal(undefined);
    revert.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(`Chapter ${review.chapter}’s Story Bible updates were undone`);
      },
      onError: error => {
        setConfirming(false);
        setRefusal(error.message);
      },
    });
  };

  return (
    <section className={styles.turnCard} data-status="applied" aria-label={`What chapter ${review.chapter} added to the Story Bible`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>{receiptTitle(review.chapter, added.length)}</span>
        {automatic && added.length > 0 && (
          <StatusChip intent="success" dot>
            automatic
          </StatusChip>
        )}
        {canUndo && (
          <Button size="sm" variant="ghost" className={styles.pushEnd} loading={revert.isPending} onClick={() => setConfirming(true)}>
            Undo
          </Button>
        )}
        <Button size="sm" variant="ghost" className={canUndo ? undefined : styles.pushEnd} onClick={onHide}>
          Hide
        </Button>
      </div>
      {added.length > 0 && (
        <div className={styles.turnOps}>
          {added.map(item => (
            <div key={item.id} className={styles.turnOp}>
              <div className={styles.turnOpRow}>
                <span className={styles.caption}>{categoryLabel(item.category)}</span>
                <span>{receiptLine(item)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {refusal && (
        <div className={styles.turnCardNote} role="alert">
          Couldn’t undo the updates: {refusal}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        intent="danger"
        title={`Undo chapter ${review.chapter}’s Story Bible updates?`}
        description="Puts back everything finalize changed in the Story Bible, as one set. The chapter’s text stays final, and later drafts are marked out of date."
        confirmLabel="Undo updates"
        loading={revert.isPending}
        onConfirm={undo}
      />
    </section>
  );
}
