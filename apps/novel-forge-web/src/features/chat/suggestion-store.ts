import { useCallback, useSyncExternalStore } from 'react';

import { type ChangeOp } from '@/lib/proposals';

import { isActionOp, type RejectionScope, type SuggestionDecision } from './chat-view';

export interface StoredAnswers {
  decisions: [number, SuggestionDecision][];
  scopes: [number, RejectionScope][];
}

const KEY_PREFIX = 'nf.chat-answers.';
const EMPTY: StoredAnswers = { decisions: [], scopes: [] };

function store(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function isAnswers(value: unknown): value is StoredAnswers {
  const record = value as Partial<StoredAnswers> | null;
  return Boolean(record && Array.isArray(record.decisions) && Array.isArray(record.scopes));
}

/**
 * A card's answers outlive a remount (a job anchoring under its message, a reload) until the card has settled and every decline's scope is
 * recorded; a replaced card's answers go at once, since its declines can no longer be scoped.
 */
export function readAnswers(proposalId: string): StoredAnswers {
  try {
    const raw = store()?.getItem(KEY_PREFIX + proposalId);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return isAnswers(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function writeAnswers(proposalId: string, answers: StoredAnswers): void {
  try {
    if (answers.decisions.length === 0 && answers.scopes.length === 0) store()?.removeItem(KEY_PREFIX + proposalId);
    else store()?.setItem(KEY_PREFIX + proposalId, JSON.stringify(answers));
  } catch {
    // Storage full or blocked: the answers still live in memory for this mount.
  }
}

/** Whether a card's saved answers have done their job: the card is no longer pending, and nothing it shows still needs a scope — an action's decline never does, since it is run or not rather than remembered. */
export function answersSettled(
  status: string,
  changeSet: readonly ChangeOp[],
  decisions: ReadonlyMap<number, SuggestionDecision>,
  scopes: ReadonlyMap<number, RejectionScope>,
): boolean {
  if (status === 'pending') return false;
  if (status !== 'applied' && status !== 'discarded' && status !== 'reverted') return true;
  return [...decisions.entries()].every(([index, decision]) => {
    if (decision !== 'decline') return true;
    const op = changeSet[index];
    return !op || isActionOp(op) || scopes.has(index);
  });
}

const halfAnswered = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot = 0;

/** How many suggestions still wait for an answer on a card the author has started answering; zero clears it. */
export function reportUnanswered(proposalId: string, remaining: number): void {
  const before = halfAnswered.get(proposalId) ?? 0;
  if (before === remaining) return;
  if (remaining > 0) halfAnswered.set(proposalId, remaining);
  else halfAnswered.delete(proposalId);
  snapshot = [...halfAnswered.values()].reduce((sum, count) => sum + count, 0);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnansweredCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => 0,
  );
}

export interface SuggestionAnswers {
  decisions: ReadonlyMap<number, SuggestionDecision>;
  scopes: ReadonlyMap<number, RejectionScope>;
  committing: boolean;
  /** Why the last commit failed; the answers are kept for the retry. */
  error?: string;
}

const NO_ANSWERS: SuggestionAnswers = { decisions: new Map(), scopes: new Map(), committing: false };
const liveAnswers = new Map<string, SuggestionAnswers>();
const answerListeners = new Map<string, Set<() => void>>();

/** One card's answers for the whole tab, so the inline card and the progress panel read and change the same ones. */
export function currentAnswers(proposalId: string): SuggestionAnswers {
  const known = liveAnswers.get(proposalId);
  if (known) return known;
  const stored = readAnswers(proposalId);
  const loaded: SuggestionAnswers = { decisions: new Map(stored.decisions), scopes: new Map(stored.scopes), committing: false };
  liveAnswers.set(proposalId, loaded);
  return loaded;
}

export function updateAnswers(proposalId: string, change: (current: SuggestionAnswers) => SuggestionAnswers): void {
  liveAnswers.set(proposalId, change(currentAnswers(proposalId)));
  for (const listener of answerListeners.get(proposalId) ?? []) listener();
}

/**
 * Answers stay in memory only while something shows the card; once the last reader leaves they are dropped, and the next one starts again
 * from what the tab stored.
 */
export function useSuggestionAnswers(proposalId: string | undefined): SuggestionAnswers {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!proposalId) return () => undefined;
      const listeners = answerListeners.get(proposalId) ?? new Set();
      listeners.add(listener);
      answerListeners.set(proposalId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        answerListeners.delete(proposalId);
        liveAnswers.delete(proposalId);
      };
    },
    [proposalId],
  );
  return useSyncExternalStore(
    subscribe,
    () => (proposalId ? currentAnswers(proposalId) : NO_ANSWERS),
    () => NO_ANSWERS,
  );
}
