import { ORGANISE_ACCEPTED_TOPIC, ORGANISE_RULED_OUT_TOPIC, ORGANISE_RULES_TOPIC, ORGANISE_TOPIC } from '@shadow-library/sdk';

import { type LedgerEntryKind, type LedgerEntryResponse, type LedgerEntryStatus } from '@/lib/apis';

/** The design phase a ledger entry was decided in, kept local rather than importing the generated Blueprint enum a server module this outlived defined it for. */
export type DesignPhase = 'idea' | 'heart' | 'core' | 'world' | 'spine' | 'volume_one' | 'opening';

const PHASE_LABELS: Record<DesignPhase, string> = {
  idea: 'Idea',
  heart: 'Heart',
  core: 'Core',
  world: 'World',
  spine: 'Spine',
  volume_one: 'Volume one',
  opening: 'Opening',
};

export interface NotebookCounts {
  decided: number;
  directions: number;
  rejected: number;
  backlog: number;
  total: number;
}

/** A system detail is still a decision to the author — it is counted as one, and marked as the system's on the entry itself. */
export function notebookCounts(entries: LedgerEntryResponse[]): NotebookCounts {
  const counts: NotebookCounts = { decided: 0, directions: 0, rejected: 0, backlog: 0, total: entries.length };
  for (const entry of entries) {
    if (entry.kind === 'decision' || entry.kind === 'system') counts.decided++;
    else if (entry.kind === 'direction') counts.directions++;
    else if (entry.kind === 'rejected') counts.rejected++;
    else counts.backlog++;
  }
  return counts;
}

export interface NotebookGroup {
  phase: DesignPhase | null;
  label: string;
  entries: LedgerEntryResponse[];
}

const ACROSS_THE_NOVEL = 'Across the novel';

/**
 * Newest first, then grouped by the phase that decided it — so the phase the author just worked in leads,
 * and an entry with no phase (the gate, anything written outside a step) collects under one heading.
 */
export function groupEntriesByPhase(entries: LedgerEntryResponse[]): NotebookGroup[] {
  const newestFirst = [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const groups: NotebookGroup[] = [];
  const byPhase = new Map<DesignPhase | null, NotebookGroup>();
  for (const entry of newestFirst) {
    const existing = byPhase.get(entry.phase);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    const group: NotebookGroup = { phase: entry.phase, label: entry.phase ? PHASE_LABELS[entry.phase] : ACROSS_THE_NOVEL, entries: [entry] };
    byPhase.set(entry.phase, group);
    groups.push(group);
  }
  return groups;
}

/**
 * The entries that arrived since the panel last looked. `seen` is null on the first look, when nothing is
 * new — everything the ledger already held is history, not something that just happened.
 */
export function newLedgerEntryIds(entries: LedgerEntryResponse[], seen: ReadonlySet<string> | null): string[] {
  if (seen === null) return [];
  return entries.filter(entry => !seen.has(entry.id)).map(entry => entry.id);
}

const WITHDRAWABLE_KINDS: LedgerEntryKind[] = ['direction', 'rejected', 'backlog'];

/** What the author may retire from the panel. A decision is changed by revisiting its step, never dropped from a list. */
export function isWithdrawable(entry: LedgerEntryResponse): boolean {
  return entry.status === 'active' && WITHDRAWABLE_KINDS.includes(entry.kind);
}

const TOPIC_WORD_BREAK = /[._-]+/;

const TOPIC_LABELS: Record<string, string> = {
  gate: 'The gate',
  promise: 'Reader promise',
  [ORGANISE_TOPIC]: 'Your notes, organised',
  [ORGANISE_ACCEPTED_TOPIC]: 'Suggestions you accepted',
  [ORGANISE_RULES_TOPIC]: 'Rules from your notes',
  [ORGANISE_RULED_OUT_TOPIC]: 'Suggestions you turned down',
  start: 'Starting point',
  'start.brief': 'Your starting text',
  'start.later': 'Later in the story',
  'concepts.corrected': 'Your idea, corrected',
  volume_one: 'Volume one',
};

/**
 * A topic is a stable key the engine addresses decisions by; the panel shows what it means instead. A key
 * with no entry of its own still reads as words rather than as a slug.
 */
export function ledgerTopicLabel(topic: string): string {
  const known = TOPIC_LABELS[topic];
  if (known) return known;
  const words = topic.split(TOPIC_WORD_BREAK).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const LEDGER_STATUS_LABELS: Record<LedgerEntryStatus, string> = {
  active: 'In force',
  superseded: 'Replaced',
  withdrawn: 'Withdrawn',
};

export const LEDGER_KIND_LABELS: Record<LedgerEntryKind, string> = {
  decision: 'Decision',
  direction: 'Direction',
  rejected: 'Rejected',
  backlog: 'Backlog',
  system: 'System’s choice',
};
