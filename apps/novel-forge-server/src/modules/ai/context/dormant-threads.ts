import { type Story } from '@server/database';

// Chapters since a thread was last touched by continuity extraction before arc planning should flag
// it — long enough that ordinary pacing (a thread resting a chapter or two) never trips it.
export const DORMANT_THREAD_THRESHOLD_CHAPTERS = 6;

export type DormantThreadKind = 'thread' | 'mystery';
export type DormantThreadReason = 'dormant' | 'overdue';

export interface DormantThreadEntry {
  kind: DormantThreadKind;
  key: string;
  label: string;
  reason: DormantThreadReason;
  lastAdvancedChapter: number | null;
  payoffWindow: number | null;
}

interface DormantCandidate {
  key: string;
  label: string;
  status: string;
  intentionallyOpen: boolean;
  openedChapter: number | null;
  lastAdvancedChapter: number | null;
  payoffWindow: number | null;
}

function evaluate(kind: DormantThreadKind, candidates: DormantCandidate[], currentChapter: number): DormantThreadEntry[] {
  const entries: DormantThreadEntry[] = [];
  for (const c of candidates) {
    if (c.status !== 'open' || c.intentionallyOpen) continue;
    const overdue = c.payoffWindow != null && currentChapter > c.payoffWindow;
    const staleness = currentChapter - (c.lastAdvancedChapter ?? c.openedChapter ?? 0);
    const dormant = staleness > DORMANT_THREAD_THRESHOLD_CHAPTERS;
    if (!overdue && !dormant) continue;
    entries.push({ kind, key: c.key, label: c.label, reason: overdue ? 'overdue' : 'dormant', lastAdvancedChapter: c.lastAdvancedChapter, payoffWindow: c.payoffWindow });
  }
  return entries;
}

/**
 * Flags open, non-`intentionallyOpen` threads/mysteries that either haven't been advanced by
 * continuity extraction in `DORMANT_THREAD_THRESHOLD_CHAPTERS` chapters ("dormant") or have passed
 * an authored `payoffWindow` while still open ("overdue") — so arc planning can deliberately address
 * them instead of letting them silently rot for the rest of the story.
 */
export function computeDormantThreads(threads: Story.PlotThread[], mysteries: Story.Mystery[], currentChapter: number): DormantThreadEntry[] {
  const threadCandidates = threads.map(t => ({
    key: t.threadKey,
    label: t.summary ?? t.threadKey,
    status: t.status,
    intentionallyOpen: t.intentionallyOpen,
    openedChapter: t.openedChapter,
    lastAdvancedChapter: t.lastAdvancedChapter,
    payoffWindow: t.payoffWindow,
  }));
  const mysteryCandidates = mysteries.map(m => ({
    key: m.mysteryKey,
    label: m.question,
    status: m.status,
    intentionallyOpen: m.intentionallyOpen,
    openedChapter: m.openedChapter,
    lastAdvancedChapter: m.lastAdvancedChapter,
    payoffWindow: m.payoffWindow,
  }));
  return [...evaluate('thread', threadCandidates, currentChapter), ...evaluate('mystery', mysteryCandidates, currentChapter)];
}

/** Renders `computeDormantThreads`' output for the arc-planning pack; '' when nothing is dormant. */
export function renderDormantThreads(entries: DormantThreadEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map(e => {
    const noun = e.kind === 'thread' ? 'Thread' : 'Mystery';
    const since = e.lastAdvancedChapter != null ? `last advanced ch ${e.lastAdvancedChapter}` : 'never advanced since it opened';
    const overdueNote = e.reason === 'overdue' ? `, past its payoff window (ch ${e.payoffWindow})` : '';
    return `${noun} **${e.key}** — ${e.reason.toUpperCase()} (${since}${overdueNote}): ${e.label}`;
  });
  return lines.join('\n');
}
