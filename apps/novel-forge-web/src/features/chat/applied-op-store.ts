import { useCallback, useSyncExternalStore } from 'react';

import { type ProposalOpDirection } from '@/lib/apis/refinement.api';

export interface OpRun {
  index: number;
  direction: ProposalOpDirection;
  /** The other changes to move first, in the server's order. */
  before: number[];
  /** Changes an earlier attempt already moved before it was refused. */
  moved: number[];
}

export interface AppliedOpState {
  /** What is moving now — one change by its index, or the whole turn — so every place showing the turn waits for it. */
  busy?: number | 'all';
  errors: ReadonlyMap<number, string>;
  prompt?: OpRun;
}

const IDLE: AppliedOpState = { errors: new Map() };
const states = new Map<string, AppliedOpState>();
const listeners = new Map<string, Set<() => void>>();

export function currentOpState(proposalId: string): AppliedOpState {
  return states.get(proposalId) ?? IDLE;
}

export function updateOpState(proposalId: string, change: (current: AppliedOpState) => AppliedOpState): void {
  states.set(proposalId, change(currentOpState(proposalId)));
  for (const listener of listeners.get(proposalId) ?? []) listener();
}

/** One applied turn's undo and redo state, shared by the docked panel, its sheet and the receipt; dropped once nothing shows the turn. */
export function useOpState(proposalId: string | undefined): AppliedOpState {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!proposalId) return () => undefined;
      const set = listeners.get(proposalId) ?? new Set();
      set.add(listener);
      listeners.set(proposalId, set);
      return () => {
        set.delete(listener);
        if (set.size > 0) return;
        listeners.delete(proposalId);
        if (currentOpState(proposalId).busy === undefined) states.delete(proposalId);
      };
    },
    [proposalId],
  );
  return useSyncExternalStore(
    subscribe,
    () => (proposalId ? currentOpState(proposalId) : IDLE),
    () => IDLE,
  );
}
