import { useRef } from 'react';
import { Button } from '@shadow-library/ui';

import { CheckIcon } from '@/components/icons';
import { type ApplyProposalResponse, type ProposalResponse, type TurnHoldReason, useProposalQuery } from '@/lib/apis';

import chatStyles from './Chat.module.css';
import { appliedReceipt, type ReceiptView, savedSides, turnReceipt } from './progress-panel-view';
import { useRevertFlow } from './ProposalSlot';
import styles from './ProgressPanel.module.css';
import { useSuggestionAnswering } from './use-suggestion-answering';

export interface TurnReceiptViewProps {
  view: ReceiptView;
  onReview: () => void;
  onUndoAll?: () => void;
  /** A change of the turn is moving in the panel; the whole undo waits for it. */
  undoLocked?: boolean;
  onAddAll?: () => void;
  onCommit?: () => void;
}

export function TurnReceiptView({ view, onReview, onUndoAll, undoLocked = false, onAddAll, onCommit }: TurnReceiptViewProps): React.JSX.Element | null {
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
        Review in panel
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

interface AppliedReceiptProps {
  novelId: string;
  sides: readonly ProposalResponse[];
  view: ReceiptView;
  onReview: () => void;
  onAddAll?: () => void;
  onCommit?: () => void;
}

function AppliedReceipt({ novelId, sides, view, onReview, onAddAll, onCommit }: AppliedReceiptProps): React.JSX.Element {
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
      <TurnReceiptView view={view} onReview={onReview} onUndoAll={revert.open} undoLocked={revert.locked} onAddAll={addAll} onCommit={commit} />
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
  onReview: () => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

function CardsReceipt({ novelId, applied, cards, held, onReview, onApplied }: CardsReceiptProps): React.JSX.Element | null {
  const rootRef = useRef<HTMLDivElement>(null);
  const { answers, addAll, commit } = useSuggestionAnswering(novelId, cards, { onApplied });
  const view = turnReceipt({ applied, cards, answers, held });
  const owed = (): void => commit();
  if (view.kind === 'none') return null;
  const sides = savedSides(applied, cards);
  if (sides.length > 0 && view.kind !== 'cards') return <AppliedReceipt novelId={novelId} sides={sides} view={view} onReview={onReview} onAddAll={addAll} onCommit={owed} />;
  return (
    <div ref={rootRef} tabIndex={-1} className={chatStyles.focusTarget}>
      <TurnReceiptView view={view} onReview={onReview} onAddAll={() => settleFocus(rootRef.current, addAll)} onCommit={() => settleFocus(rootRef.current, owed)} />
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
  onReview: () => void;
  onApplied: (result: ApplyProposalResponse) => void;
}

/** What a turn changed, in one line after its reply: saved changes with Undo all, suggestions waiting with Add all, or both. The panel has the detail. */
export function TurnReceipt({ novelId, appliedProposalId, proposalId, held, onReview, onApplied, ...fallback }: TurnReceiptProps): React.JSX.Element | null {
  const appliedQuery = useProposalQuery(novelId, appliedProposalId);
  const cardsQuery = useProposalQuery(novelId, proposalId);
  const applied = appliedQuery.data ?? fallback.applied;
  const cards = cardsQuery.data ?? fallback.cards;
  if (cards) return <CardsReceipt novelId={novelId} applied={applied} cards={cards} held={held} onReview={onReview} onApplied={onApplied} />;
  if (applied) return <AppliedReceipt novelId={novelId} sides={[applied]} view={appliedReceipt([applied], 0)} onReview={onReview} />;
  return null;
}
