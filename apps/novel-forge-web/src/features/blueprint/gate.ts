import { type BlueprintPhase, type BlueprintPhaseProgressResponse, type LedgerEntryResponse } from '@/lib/apis';

export const GATE_ROUTE_KEY = 'gate';

export interface GatePhaseSummary {
  phase: BlueprintPhase;
  label: string;
  done: boolean;
  /** What the phase settled, in the author's own words; empty while it is still open. */
  parts: string[];
  /** Where "Revisit" goes — the phase's first applicable step. */
  step: string | null;
}

export interface StopTestAnswer {
  id: 'chapter-one' | 'waiting-for' | 'terminal';
  question: string;
  answer: string | null;
}

const DECIDED_KINDS = ['decision', 'system'];

function decision(entries: LedgerEntryResponse[], topic: string): LedgerEntryResponse | null {
  return [...entries].reverse().find(entry => entry.topic === topic && DECIDED_KINDS.includes(entry.kind)) ?? null;
}

function statement(entries: LedgerEntryResponse[], topic: string): string | null {
  return decision(entries, topic)?.statement.trim() || null;
}

function payload(entry: LedgerEntryResponse | null): Record<string, unknown> {
  return entry?.payload ?? {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(entries: LedgerEntryResponse[], topic: string, field: string, singular: string, plural = `${singular}s`): string | null {
  const total = rows(payload(decision(entries, topic))[field]).length;
  return total > 0 ? `${total} ${total === 1 ? singular : plural}` : null;
}

function ideaParts(entries: LedgerEntryResponse[]): (string | null)[] {
  return [statement(entries, 'premise')];
}

function heartParts(entries: LedgerEntryResponse[]): (string | null)[] {
  return [statement(entries, 'theme'), statement(entries, 'promise')];
}

function coreParts(entries: LedgerEntryResponse[]): (string | null)[] {
  const opposition = statement(entries, 'opposition');
  return [statement(entries, 'protagonist'), opposition && `Opposed by ${opposition}`];
}

function worldParts(entries: LedgerEntryResponse[]): (string | null)[] {
  return [statement(entries, 'world.cost'), statement(entries, 'world.power')];
}

function spineParts(entries: LedgerEntryResponse[]): (string | null)[] {
  return [statement(entries, 'spine')];
}

function volumeOneParts(entries: LedgerEntryResponse[]): (string | null)[] {
  return [count(entries, 'cast', 'members', 'cast card'), count(entries, 'places', 'places', 'place'), count(entries, 'arcs', 'arcs', 'arc')];
}

function openingParts(entries: LedgerEntryResponse[]): (string | null)[] {
  const check = payload(decision(entries, 'check'))['open'];
  const open = typeof check === 'number' ? check : null;
  return [
    count(entries, 'briefs', 'briefs', 'brief'),
    decision(entries, 'voice') ? 'voice chosen' : null,
    open === null ? null : `${open} open ${open === 1 ? 'finding' : 'findings'}`,
  ];
}

const PHASE_PARTS: Record<BlueprintPhase, (entries: LedgerEntryResponse[]) => (string | null)[]> = {
  idea: ideaParts,
  heart: heartParts,
  core: coreParts,
  world: worldParts,
  spine: spineParts,
  volume_one: volumeOneParts,
  opening: openingParts,
};

/** The whole design on one page, read back out of the decisions themselves rather than out of a summary anything had to keep up to date. */
export function gateSummary(phases: BlueprintPhaseProgressResponse[], entries: LedgerEntryResponse[]): GatePhaseSummary[] {
  return phases.map(phase => ({
    phase: phase.phase,
    label: phase.label,
    done: phase.status === 'done',
    parts: PHASE_PARTS[phase.phase](entries).filter((part): part is string => part !== null && part !== ''),
    step: phase.steps.find(step => step.applies)?.key ?? null,
  }));
}

function chapterOne(entries: LedgerEntryResponse[]): string | null {
  const first = rows(payload(decision(entries, 'briefs'))['briefs']).sort((a, b) => Number(a['chapter'] ?? 0) - Number(b['chapter'] ?? 0))[0];
  return text(first?.['purpose']) || text(first?.['title']) || null;
}

function lastBriefedChapter(entries: LedgerEntryResponse[]): number | null {
  const chapters = rows(payload(decision(entries, 'briefs'))['briefs'])
    .map(brief => brief['chapter'])
    .filter((chapter): chapter is number => typeof chapter === 'number');
  return chapters.length > 0 ? Math.max(...chapters) : null;
}

/**
 * The reveal the reader is waiting for is named by when it lands, never by what it is: the truth is a
 * spoiler the Notebook holds, and a gate page the author reads beside their own draft is no place for it.
 */
function waitingFor(entries: LedgerEntryResponse[]): string | null {
  const reveals = rows(payload(decision(entries, 'spine.reveals'))['reveals']);
  const pinned = reveals.find(reveal => reveal['pinned'] === true) ?? reveals[0];
  if (pinned) return text(pinned['when']) || null;
  const arcOne = rows(payload(decision(entries, 'arcs'))['arcs'])[0];
  return text(arcOne?.['turn']) || null;
}

/** The three questions the author answers out loud before the gate — each one from a decision they already made. */
export function stopTest(entries: LedgerEntryResponse[]): StopTestAnswer[] {
  const last = lastBriefedChapter(entries);
  return [
    { id: 'chapter-one', question: 'What happens in chapter 1?', answer: chapterOne(entries) },
    { id: 'waiting-for', question: `What is the reader waiting for at chapter ${last ?? 10}?`, answer: waitingFor(entries) },
    { id: 'terminal', question: 'What is the terminal question?', answer: statement(entries, 'ending') },
  ];
}

export function gateHeadline(phases: BlueprintPhaseProgressResponse[]): string {
  const done = phases.filter(phase => phase.status === 'done').length;
  return `Blueprint · ${done} of ${phases.length}`;
}
