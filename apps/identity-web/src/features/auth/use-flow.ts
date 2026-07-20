/**
 * Importing npm packages
 */
import { useCallback, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { type FlowState, isApiError } from '@/lib/apis';

/**
 * Defining types
 */

/** Why a flow became unrecoverable: `expired` (timed out / not found) vs `locked` (terminated after too many failures). */
export type DeadReason = 'expired' | 'locked';

export interface FlowUiState {
  flow: FlowState | null;
  busy: boolean;
  /** Human-ready inline error for the current step; cleared on the next action. */
  error: string | null;
  /** Set when the flow is unrecoverable (expired/terminated) — the page offers a restart. */
  dead: boolean;
  /** Distinguishes the death cause so the page can show a lock-out card instead of the generic expiry one. */
  deadReason: DeadReason | null;
}

export interface FlowActions {
  /** Runs a flow transition, translating typed failures into step state; returns the next flow or null. */
  run(action: () => Promise<FlowState>): Promise<FlowState | null>;
  reset(): void;
  setError(message: string | null): void;
  /** Adopts a flow born elsewhere (a federated callback redirect carries flowId + status). */
  hydrate(state: FlowState): void;
}

/**
 * Declaring the constants
 */
const RETRY_MESSAGE = (seconds?: number): string => (seconds ? `Too many attempts — try again in ${seconds}s.` : 'Too many attempts — try again shortly.');

const REJECTED_MESSAGE = (attemptsLeft: number): string =>
  attemptsLeft > 0 ? `That didn’t work — ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.` : 'No attempts left. This attempt is locked.';

/**
 * Shared state-machine plumbing for the login / registration / recovery pages. Every transition runs
 * through `run`, which folds the identity API's typed non-2xx bodies (rejected proofs, rate limits,
 * expired flows) into inline step state so the pages stay declarative.
 */
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
      // A same-status answer carrying an attempts budget is a rejected proof, not a transition.
      if (previous && previous.status === next.status && next.attemptsLeft !== undefined) setError(REJECTED_MESSAGE(next.attemptsLeft));
      return next;
    } catch (cause) {
      // `isApiError` (web 0.2) instead of `instanceof` — the guard still holds when the SSR and client
      // bundles each carry their own `ApiError` class identity.
      // AUTH_004 is a flow terminated after too many failures (a lock-out); any other 410/409 is an expiry.
      if (isApiError(cause) && (cause.status === 410 || cause.status === 409)) {
        setDead(true);
        setDeadReason(cause.code === 'AUTH_004' ? 'locked' : 'expired');
      } else if (isApiError(cause) && cause.status === 429) setError(RETRY_MESSAGE(cause.retryAfterSeconds));
      else if (isApiError(cause) && cause.fields?.length) setError(cause.fields.map(field => field.msg).join(' '));
      else if (isApiError(cause)) setError(cause.message);
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
    setDeadReason(null);
  }, []);

  const hydrate = useCallback((state: FlowState) => {
    previousFlow.current = state;
    setFlow(state);
  }, []);

  return { flow, busy, error, dead, deadReason, run, reset, setError, hydrate };
}
