import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { failureCopy, notifyOutcome, type QuestLinkageOffer, useCommand } from '@/lib/data';

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

  const feedback = { action: 'complete', subject: offer.questName };
  const complete = async (): Promise<void> => {
    const outcome = await command.run({ type: 'quest.complete', occurrenceId: `${offer.questId}:${offer.date}` }).catch(() => null);
    if (!outcome) return notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { ...feedback, success: '' });
    if (outcome.status === 'needs-confirmation') return;
    const completed = outcome.status === 'applied' || outcome.status === 'queued-offline';
    notifyOutcome(outcome, { ...feedback, success: completed ? outcome.local.message : '' });
  };

  return (
    <Alert intent="success" title={`This could complete “${offer.questName}”`} action={{ label: `Complete ${offer.questName}`, onClick: () => void complete() }}>
      The entry is saved and carries no reward of its own — the quest’s reward is yours to claim, and Shadow Memoir never claims it for you.
    </Alert>
  );
}
