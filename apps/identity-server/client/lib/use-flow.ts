/**
 * Importing npm packages
 */
import { useCallback, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { ApiError, type FlowState } from './api';

/**
 * Defining types
 */

export interface FlowUiState {
  flow: FlowState | null;
  busy: boolean;
  /** Human-ready inline error for the current step; cleared on the next action. */
  error: string | null;
  /** Set when the flow is unrecoverable (expired/terminated) — the page offers a restart. */
  dead: boolean;
}

export interface FlowActions {
  /** Runs a flow transition, translating typed failures into step state. */
  run(action: () => Promise<FlowState>): Promise<FlowState | null>;
  reset(): void;
  setError(message: string | null): void;
  /** Adopts a flow born elsewhere (federated callback redirects carry flow_id + status). */
  hydrate(state: FlowState): void;
}

/**
 * Declaring the constants
 */
const RETRY_MESSAGE = (seconds?: number): string => (seconds ? `Too many attempts — try again in ${seconds}s.` : 'Too many attempts — try again shortly.');

const REJECTED_MESSAGE = (attemptsLeft: number): string =>
  attemptsLeft > 0 ? `That didn't work — ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.` : 'No attempts left. This attempt is locked.';

/** Shared state machine plumbing for the login/registration/recovery pages. */
export function useFlow(): FlowUiState & FlowActions {
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const previousFlow = useRef<FlowState | null>(null);

  const run = useCallback(async (action: () => Promise<FlowState>): Promise<FlowState | null> => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      const previous = previousFlow.current;
      previousFlow.current = next;
      setFlow(next);
      // A same-status answer carrying an attempts budget is a rejected proof, not a transition.
      if (previous && previous.status === next.status && next.attemptsLeft !== undefined) setError(REJECTED_MESSAGE(next.attemptsLeft));
      return next;
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 410 || cause.status === 409)) setDead(true);
      else if (cause instanceof ApiError && cause.status === 429) setError(RETRY_MESSAGE(cause.retryAfterSeconds));
      else if (cause instanceof ApiError && cause.fields?.length) setError(cause.fields.map(field => field.msg).join(' '));
      else setError('Something went wrong. Please try again.');
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
  }, []);

  /** Adopts a flow born elsewhere (a federated callback redirect carries flow_id + status). */
  const hydrate = useCallback((state: FlowState) => {
    previousFlow.current = state;
    setFlow(state);
  }, []);

  return { flow, busy, error, dead, run, reset, setError, hydrate };
}
