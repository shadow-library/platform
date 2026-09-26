import { useSyncExternalStore } from 'react';

import { type RejectionScope, type SuggestionDecision } from './chat-view';

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

/** Whether a card's saved answers have done their job: the card is no longer pending, and nothing it shows still needs a scope. */
export function answersSettled(status: string, decisions: ReadonlyMap<number, SuggestionDecision>, scopes: ReadonlyMap<number, RejectionScope>): boolean {
  if (status === 'pending') return false;
  if (status !== 'applied' && status !== 'discarded' && status !== 'reverted') return true;
  return [...decisions.entries()].every(([index, decision]) => decision !== 'decline' || scopes.has(index));
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
