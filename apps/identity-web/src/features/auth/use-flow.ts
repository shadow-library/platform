import { useCallback, useRef, useState } from 'react';

import { type FlowState, isApiError } from '@/lib/apis';
import { type DeadReason, flowFailureOutcome, rejectedProofMessage } from '@/lib/auth-flow';

export interface FlowUiState {
  flow: FlowState | null;
  busy: boolean;
  /** Human-ready inline error for the current step; cleared on the next action. */
  error: string | null;
  dead: boolean;
  /** Distinguishes the death cause so the page can show a lock-out card instead of the generic expiry one. */
  deadReason: DeadReason | null;
}

export interface FlowActions {
  /** Runs a flow transition, translating typed failures into step state; returns the next flow or null. */
  run(action: () => Promise<FlowState>): Promise<FlowState | null>;
  reset(): void;
  setError(message: string | null): void;
}

export function useFlow(): FlowUiState & FlowActions {
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [deadReason, setDeadReason] = useState<DeadReason | null>(null);
  const previousFlow = useRef<FlowState | null>(null);

  const run = useCallback(async (action: () => Promise<FlowState>): Promise<FlowState | null> => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      const previous = previousFlow.current;
      previousFlow.current = next;
      setFlow(next);
      /** A same-status answer carrying an attempts budget is a rejected proof, not a transition. */
      const rejected = rejectedProofMessage(previous, next);
      if (rejected) setError(rejected);
      return next;
    } catch (cause) {
      /** `isApiError` instead of `instanceof`: the SSR and client bundles each carry their own `ApiError` class. */
      const outcome = flowFailureOutcome(isApiError(cause) ? cause : null);
      if (outcome.kind === 'dead') {
        setDead(true);
        setDeadReason(outcome.reason);
      } else setError(outcome.message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    previousFlow.current = null;
    setFlow(null);
    setError(null);
    setDead(false);
    setDeadReason(null);
  }, []);

  return { flow, busy, error, dead, deadReason, run, reset, setError };
}
