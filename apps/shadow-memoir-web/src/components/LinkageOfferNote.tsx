import { type ReactElement } from 'react';
import { Alert, toast } from '@shadow-library/ui';

import { needsConfirmation, type QuestLinkageOffer, useCommand } from '@/lib/data';

export interface LinkageOfferNoteProps {
  offer: QuestLinkageOffer | null | undefined;
}

/**
 * PRD §2.6's consent step made visible: a saved entry that could satisfy a module-linked quest offers
 * the completion and never performs it. The entry's own reward was already withheld — completing the
 * quest is what grants the quest's, and only the owner can ask for it.
 */
export function LinkageOfferNote({ offer }: LinkageOfferNoteProps): ReactElement | null {
  const command = useCommand();
  if (!offer) return null;

  if (offer.status === 'already-completed')
    return (
      <Alert intent="info" title={`${offer.questName} is already done today`}>
        The entry is saved. Its own reward stays with the quest you have already completed.
      </Alert>
    );

  return (
    <Alert
      intent="success"
      title={`This could complete “${offer.questName}”`}
      action={{
        label: `Complete ${offer.questName}`,
        onClick: () =>
          command.mutate(
            { type: 'quest.complete', occurrenceId: `${offer.questId}:${offer.date}` },
            { onSuccess: result => void (needsConfirmation(result) || toast.success(result.message)) },
          ),
      }}
    >
      The entry is saved and carries no reward of its own — the quest’s reward is yours to claim, and Shadow Memoir never claims it for you.
    </Alert>
  );
}
