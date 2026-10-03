import { toast } from '@shadow-library/ui';

import { type DraftResponse, useApproveDraftMutation, useChapterReviewsQuery } from '@/lib/apis';
import { approvalMessage, approvalRefusal, blockingHold } from '@/lib/chapter-checks';

import { useOverrideConfirm } from './use-override-confirm';

export interface DraftApproval {
  /** Approves the draft, first confirming an override of open blocking findings; `onApproved` runs once it lands. */
  approve: (onApproved?: () => void) => void;
  pending: boolean;
  /** Why approval is refused outright, when it is. */
  refusal?: string;
  /** Open blocking findings the approval would record as overridden. */
  held: number;
  dialog: React.JSX.Element;
  confirming: boolean;
}

export function useDraftApproval(novelId: string, draft: DraftResponse): DraftApproval {
  const approveDraft = useApproveDraftMutation(novelId);
  const reviews = useChapterReviewsQuery(novelId, draft.chapter);
  const held = blockingHold(reviews.data);
  const refusal = approvalRefusal(draft.reviewStatus, held);
  const overrideConfirm = useOverrideConfirm(draft.chapter, held);

  const approve = (onApproved?: () => void): void => {
    if (approveDraft.isPending) return;
    if (refusal) return void toast.warning(refusal);
    overrideConfirm.request(() =>
      approveDraft.mutate(draft, {
        onSuccess: approved => {
          const message = approvalMessage(draft.chapter, approved.overriddenFindings);
          if (approved.overriddenFindings) toast.warning(message);
          else toast.success(message);
          onApproved?.();
        },
        onError: err => toast.danger(err.message),
      }),
    );
  };

  return { approve, pending: approveDraft.isPending, refusal, held, dialog: overrideConfirm.dialog, confirming: overrideConfirm.open };
}
