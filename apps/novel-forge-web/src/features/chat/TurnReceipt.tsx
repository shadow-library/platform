import { useRef } from 'react';
import { Button } from '@shadow-library/ui';

import { CheckIcon } from '@/components/icons';
import { type ApplyProposalResponse, type ProposalResponse, useProposalQuery } from '@/lib/apis';

import chatStyles from './Chat.module.css';
import { appliedReceipt, cardsReceipt, type ReceiptView } from './progress-panel-view';
import { useRevertFlow } from './ProposalSlot';
import styles from './ProgressPanel.module.css';
import { useSuggestionAnswers } from './suggestion-store';
import { useSuggestionAnswering } from './use-suggestion-answering';

export interface TurnReceiptViewProps {
  view: ReceiptView;
  onReview: () => void;
  onUndoAll?: () => void;
  /** A change of the turn is moving in the panel; the whole undo waits for it. */
  undoLocked?: boolean;
  onAddAll?: () => void;
}

export function TurnReceiptView({ view, onReview, onUndoAll, undoLocked = false, onAddAll }: TurnReceiptViewProps): React.JSX.Element | null {
  if (view.kind === 'none') return null;
  const tone = view.kind === 'cards' ? view.tone : view.kind;
  return (
    <div className={styles.receipt} data-tone={tone}>
      <span className={styles.receiptMark} aria-hidden="true">
        {view.kind === 'cards' && view.tone === 'waiting' ? view.count || <CheckIcon size={14} /> : <CheckIcon size={14} />}
      </span>
      <span className={styles.receiptText}>
        <span className={styles.receiptTitle}>{view.title}</span>
        {view.kind !== 'reverted' && view.detail && <span className={styles.receiptDetail}>{view.detail}</span>}
      </span>
      <Button size="sm" variant="secondary" onClick={onReview}>
        Review in panel
      </Button>
      {view.kind === 'applied' && view.canUndoAll && onUndoAll && (
        <Button size="sm" variant="ghost" disabled={undoLocked} onClick={onUndoAll}>
          Undo all
        </Button>
      )}
      {view.kind === 'cards' && view.canAddAll && onAddAll && (
        <Button size="sm" variant="primary" onClick={onAddAll}>
          Add all
        </Button>
      )}
    </div>
  );
}

interface AppliedReceiptProps {
  novelId: string;
  proposal: ProposalResponse;
  waitingCards: number;
  onReview: () => void;
}

function AppliedReceipt({ novelId, proposal, waitingCards, onReview }: AppliedReceiptProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const revert = useRevertFlow(novelId, proposal.id, rootRef);
  return (
    <div ref={rootRef} tabIndex={-1} className={chatStyles.focusTarget}>
      <TurnReceiptView view={appliedReceipt(proposal, waitingCards)} onReview={onReview} onUndoAll={revert.open} undoLocked={revert.locked} />
      {revert.dialog}
    </div>
  );
}

interface CardsReceiptProps {
  novelId: string;
  proposal: ProposalResponse;
  onReview: () => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

function CardsReceipt({ novelId, proposal, onReview, onApplied }: CardsReceiptProps): React.JSX.Element {
  const { answers, addAll } = useSuggestionAnswering(novelId, proposal, { onApplied });
  return <TurnReceiptView view={cardsReceipt(proposal, answers)} onReview={onReview} onAddAll={addAll} />;
}

export interface TurnReceiptProps {
  novelId: string;
  appliedProposalId?: string;
  proposalId?: string;
  /** The settled turn's own copies, drawn until the proposal queries answer. */
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  onReview: () => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

/** What a turn changed, in one line after its reply: saved changes with Undo all, or suggestions waiting with Add all. The panel has the detail. */
export function TurnReceipt({ novelId, appliedProposalId, proposalId, onReview, onApplied, ...fallback }: TurnReceiptProps): React.JSX.Element | null {
  const appliedQuery = useProposalQuery(novelId, appliedProposalId);
  const cardsQuery = useProposalQuery(novelId, proposalId);
  const applied = appliedQuery.data ?? fallback.applied;
  const cards = cardsQuery.data ?? fallback.cards;
  const answers = useSuggestionAnswers(cards?.id);
  const waiting = cards?.status === 'pending' && cards.kind !== 'chapter_plan' ? cards.changeSet.length - answers.decisions.size : 0;
  if (applied && appliedReceipt(applied, waiting).kind !== 'none') return <AppliedReceipt novelId={novelId} proposal={applied} waitingCards={waiting} onReview={onReview} />;
  if (cards) return <CardsReceipt novelId={novelId} proposal={cards} onReview={onReview} onApplied={onApplied} />;
  return null;
}
