import { type RefObject, useRef, useState } from 'react';
import { toast } from '@shadow-library/ui';

import { useRevertProposalMutation, useUndoImpactQuery } from '@/lib/apis';

import { currentOpState, updateOpState, useOpState } from './applied-op-store';
import { mergeUndoImpacts } from './chat-view';
import { UndoImpactDialog } from './UndoImpactDialog';

export interface RevertFlow {
  open: () => void;
  dialog: React.JSX.Element;
  /** A change of these proposals is moving — here, or in the progress panel — so a whole revert waits. */
  locked: boolean;
}

/** Undoes whole applied proposals in the order given — a turn's added suggestions before its saved changes — after showing what relies on them. */
export function useRevertFlow(novelId: string, proposalIds: readonly string[], fallback: RefObject<HTMLElement | null>): RevertFlow {
  const [first, second] = proposalIds;
  const [confirming, setConfirming] = useState(false);
  const firstImpact = useUndoImpactQuery(novelId, first, confirming);
  const secondImpact = useUndoImpactQuery(novelId, second, confirming);
  const revert = useRevertProposalMutation(novelId);
  const firstState = useOpState(first);
  const secondState = useOpState(second);
  const openerRef = useRef<HTMLElement | null>(null);
  const busy = firstState.busy ?? secondState.busy;

  const open = (): void => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirming(true);
  };

  const restoreFocus = (event: Event): void => {
    event.preventDefault();
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
    else fallback.current?.focus();
  };

  const undo = async (): Promise<void> => {
    if (proposalIds.length === 0 || proposalIds.some(id => currentOpState(id).busy !== undefined)) return;
    for (const id of proposalIds) updateOpState(id, current => ({ ...current, busy: 'all' }));
    try {
      for (const id of proposalIds) await revert.mutateAsync(id);
      setConfirming(false);
      toast.success('Undone — your Story Bible is back as it was');
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : 'Couldn’t undo it.');
    } finally {
      for (const id of proposalIds) updateOpState(id, current => ({ ...current, busy: undefined }));
    }
  };

  const impacts = [firstImpact, ...(second ? [secondImpact] : [])];
  const loaded = impacts.flatMap(impact => (impact.data ? [impact.data] : []));
  const dialog = (
    <UndoImpactDialog
      open={confirming}
      onOpenChange={setConfirming}
      onCloseAutoFocus={restoreFocus}
      impact={loaded.length === impacts.length ? mergeUndoImpacts(loaded) : undefined}
      loading={impacts.some(impact => impact.isLoading)}
      error={impacts.find(impact => impact.error)?.error}
      onRetry={() => impacts.forEach(impact => void impact.refetch())}
      onConfirm={() => void undo()}
      confirming={busy === 'all'}
    />
  );
  return { open, dialog, locked: busy !== undefined };
}
