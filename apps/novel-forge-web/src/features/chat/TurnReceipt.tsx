import { useRef } from 'react';
import { Button, CheckIcon } from '@shadow-library/ui';

import { type ApplyProposalResponse, type ProposalResponse, type TurnHoldReason, useProposalQuery } from '@/lib/apis';

import chatStyles from './Chat.module.css';
import { type CardsReceiptInput, type ReceiptView, savedSides, turnReceipt } from './progress-panel-view';
import styles from './ProgressPanel.module.css';
import { reviewableCard } from './review-answers';
import { useRevertFlow } from './use-revert-flow';
import { useSuggestionAnswering } from './use-suggestion-answering';

const NO_ANSWERS: CardsReceiptInput = { decisions: new Map(), committing: false };

export interface TurnReceiptViewProps {
  view: ReceiptView;
  onReview: () => void;
  reviewLabel?: string;
  onUndoAll?: () => void;
  /** A change of the turn is moving in the panel; the whole undo waits for it. */
  undoLocked?: boolean;
  onAddAll?: () => void;
  onCommit?: () => void;
}

export function TurnReceiptView({
  view,
  onReview,
  reviewLabel = 'Review in panel',
  onUndoAll,
  undoLocked = false,
  onAddAll,
  onCommit,
}: TurnReceiptViewProps): React.JSX.Element | null {
  if (view.kind === 'none') return null;
  const tone = view.kind === 'cards' ? view.tone : view.kind;
  const summary = view.kind === 'reverted' ? undefined : view;
  return (
    <div className={styles.receipt} data-tone={tone}>
      <span className={styles.receiptMark} aria-hidden="true">
        {view.kind === 'cards' && view.tone === 'waiting' ? view.count || <CheckIcon size={14} /> : <CheckIcon size={14} />}
      </span>
      <span className={styles.receiptText}>
        <span className={styles.receiptTitle}>{view.title}</span>
        {summary?.detail && <span className={styles.receiptDetail}>{summary.detail}</span>}
        {summary?.hold && <span className={styles.receiptDetail}>{summary.hold}</span>}
      </span>
      <Button size="sm" variant="secondary" onClick={onReview}>
        {reviewLabel}
      </Button>
      {view.kind === 'applied' && view.canUndoAll && onUndoAll && (
        <Button size="sm" variant="ghost" disabled={undoLocked} onClick={onUndoAll}>
          Undo all
        </Button>
      )}
      {summary?.canAddAll && onAddAll && (
        <Button size="sm" variant="primary" onClick={onAddAll}>
          Add all
        </Button>
      )}
      {summary?.commit && onCommit && (
        <Button size="sm" variant="primary" onClick={onCommit}>
          {summary.commit}
        </Button>
      )}
    </div>
  );
}

interface ReviewAction {
  onReview: () => void;
  reviewLabel?: string;
}

interface AppliedReceiptProps extends ReviewAction {
  novelId: string;
  sides: readonly ProposalResponse[];
  view: ReceiptView;
  onAddAll?: () => void;
  onCommit?: () => void;
}

function AppliedReceipt({ novelId, sides, view, onReview, reviewLabel, onAddAll, onCommit }: AppliedReceiptProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const revert = useRevertFlow(
    novelId,
    sides.filter(side => side.status === 'applied').map(side => side.id),
    rootRef,
  );
  const addAll = onAddAll && ((): void => settleFocus(rootRef.current, onAddAll));
  const commit = onCommit && ((): void => settleFocus(rootRef.current, onCommit));
  return (
    <div ref={rootRef} tabIndex={-1} className={chatStyles.focusTarget}>
      <TurnReceiptView view={view} onReview={onReview} reviewLabel={reviewLabel} onUndoAll={revert.open} undoLocked={revert.locked} onAddAll={addAll} onCommit={commit} />
      {revert.dialog}
    </div>
  );
}

/** The button pressed goes away, so focus moves to the receipt rather than the page. */
function settleFocus(receipt: HTMLElement | null, action: () => void): void {
  action();
  receipt?.focus();
}

interface CardsReceiptProps {
  novelId: string;
  applied?: ProposalResponse;
  cards: ProposalResponse;
  held?: TurnHoldReason;
  ideas?: ReadonlySet<number>;
  note?: string;
  onReview: () => void;
  onReviewCards?: (proposalId: string) => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

function CardsReceipt({ novelId, applied, cards, held, ideas, note, onReview, onReviewCards, onApplied }: CardsReceiptProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null);
  const { answers, addAll, commit } = useSuggestionAnswering(novelId, cards, { onApplied });
  const view = turnReceipt({ applied, cards, answers, held, ideas, note });
  const owed = (): void => commit(true);
  if (view.kind === 'none') return null;
  const review: ReviewAction = onReviewCards && reviewableCard(cards) ? { onReview: () => onReviewCards(cards.id), reviewLabel: 'Review changes' } : { onReview };
  const sides = savedSides(applied, cards);
  if (sides.length > 0 && view.kind !== 'cards') return <AppliedReceipt novelId={novelId} sides={sides} view={view} {...review} onAddAll={addAll} onCommit={owed} />;
  return (
    <div ref={rootRef} tabIndex={-1} className={chatStyles.focusTarget}>
      <TurnReceiptView view={view} {...review} onAddAll={() => settleFocus(rootRef.current, addAll)} onCommit={() => settleFocus(rootRef.current, owed)} />
    </div>
  );
}

export interface TurnReceiptProps {
  novelId: string;
  appliedProposalId?: string;
  proposalId?: string;
  /** The settled turn's own copies, drawn until the proposal queries answer. */
  applied?: ProposalResponse;
  cards?: ProposalResponse;
  /** Why the turn's cards were held; only the tab that ran the turn knows it. */
  held?: TurnHoldReason;
  /** The card's ops that are Forge's ideas, where only the job's receipt says so. */
  ideas?: ReadonlySet<number>;
  /** Why something resting on the author's words waits on the card. */
  note?: string;
  onReview: () => void;
  onReviewCards?: (proposalId: string) => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

/** What a turn or a job changed, in one line: saved changes with Undo all, suggestions waiting with Add all, or both. The panel has the detail. */
export function TurnReceipt({
  novelId,
  appliedProposalId,
  proposalId,
  held,
  ideas,
  note,
  onReview,
  onReviewCards,
  onApplied,
  ...fallback
}: TurnReceiptProps): React.JSX.Element | null {
  const appliedQuery = useProposalQuery(novelId, appliedProposalId);
  const cardsQuery = useProposalQuery(novelId, proposalId);
  const applied = appliedQuery.data ?? fallback.applied;
  const cards = cardsQuery.data ?? fallback.cards;
  if (cards) {
    return (
      <CardsReceipt
        novelId={novelId}
        applied={applied}
        cards={cards}
        held={held}
        ideas={ideas}
        note={note}
        onReview={onReview}
        onReviewCards={onReviewCards}
        onApplied={onApplied}
      />
    );
  }
  if (!applied) return null;
  return <AppliedReceipt novelId={novelId} sides={[applied]} view={turnReceipt({ applied, answers: NO_ANSWERS, note })} onReview={onReview} />;
}
