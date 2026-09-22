import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { CAST_LADDER_TOPIC } from './cast-step';
import { decisionPayload, lockedDecision, passList, passText, sameJson } from './engine-pass';

export const ARCS_TOPIC = 'arcs';
export const ARCS_NAME_MAX = 80;
export const ARCS_LINE_MAX = 200;
export const ARCS_WRITER_LINE_MAX = 240;
export const ARCS_WHY_MAX = 400;
export const ARCS_MAX = 8;
export const ARC_CHAPTERS_MIN = 2;
export const ARC_CHAPTERS_MAX = 60;

export interface ArcOption {
  id: string;
  title: string;
  purpose: string;
  turn: string;
  chapters: number;
  rung: string;
}

export interface ArcsRound {
  volumeTitle: string;
  /** How long volume one runs, so the screen can refuse more arcs than it has chapters before the server has to. */
  volumeChapters: number;
  arcs: ArcOption[];
}

function passNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseArcsRound(round: BlueprintRoundResponse | null): ArcsRound {
  const options = round?.options as { volumeTitle?: unknown; volumeChapters?: unknown; arcs?: unknown } | null;
  const arcs = passList(options?.arcs).flatMap(item => {
    const arc = item as Partial<ArcOption>;
    return typeof arc.id === 'string'
      ? [
          {
            id: arc.id,
            title: passText(arc.title),
            purpose: passText(arc.purpose),
            turn: passText(arc.turn),
            chapters: passNumber(arc.chapters, ARC_CHAPTERS_MIN),
            rung: passText(arc.rung),
          },
        ]
      : [];
  });
  return { volumeTitle: passText(options?.volumeTitle), volumeChapters: passNumber(options?.volumeChapters, 0), arcs };
}

/** The rungs the cast screen locked, which are the only ones an arc may land. Empty until the ladder is decided. */
export function ladderRungs(entries: LedgerEntryResponse[]): string[] {
  return passList(decisionPayload(lockedDecision(entries, CAST_LADDER_TOPIC))['rungs'])
    .map(item => passText((item as { name?: unknown }).name))
    .filter(Boolean);
}

export interface ArcDraft {
  optionId?: string;
  title: string;
  purpose: string;
  turn: string;
  chapters: number;
  rung: string;
}

export interface ArcsDraft {
  arcs: ArcDraft[];
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export function arcsAnchor(arcs: ArcDraft[]): string {
  return arcs
    .filter(arc => arc.title.trim())
    .map(arc => arc.title.trim())
    .join(' → ');
}

export function editArc(arcs: ArcDraft[], index: number, patch: Partial<Omit<ArcDraft, 'optionId'>>): ArcDraft[] {
  const next = arcs.map((arc, at) => {
    if (at !== index) return arc;
    const title = patch.title ?? arc.title;
    return { ...arc, ...patch, ...(title.trim() === arc.title.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((arc, at) => arc.title.trim().length > 0 || at === index);
}

/**
 * A rung lands on one arc: placing it where it already is takes it off, and placing it elsewhere moves it. Like `editArc` it is handed
 * the list on screen, which ends in the blank row the screen offers for the next arc — and unlike an edit it has no row to keep, so the
 * blank is dropped rather than committed.
 */
export function placeRung(arcs: ArcDraft[], index: number, rung: string): ArcDraft[] {
  return arcs
    .map((arc, at) => {
      if (at === index) return { ...arc, rung: arc.rung === rung ? '' : rung };
      return arc.rung === rung ? { ...arc, rung: '' } : arc;
    })
    .filter(arc => arc.title.trim().length > 0);
}

/** Exactly the arcs a lock would carry: the screen anchors its lines to these, so what it shows and what it sends can never disagree. */
export function committedArcs(draft: ArcsDraft): ArcDraft[] {
  return draft.arcs.filter(arc => arc.title.trim() && arc.purpose.trim() && arc.turn.trim()).slice(0, ARCS_MAX);
}

export function arcsDraftAnchor(draft: ArcsDraft): string {
  return arcsAnchor(committedArcs(draft));
}

/** Why the lock is unavailable, in the author's words. `buildArcsSelection` refuses exactly when this answers. */
export function arcsLockIssue(draft: ArcsDraft, volumeChapters = 0): string | null {
  const arcs = committedArcs(draft);
  if (arcs.length === 0) return 'Every arc needs a name, what it is for, and the turn it ends on.';
  if (volumeChapters > 0 && arcs.length > volumeChapters) return `Volume one is ${volumeChapters} chapters long, so it cannot hold ${arcs.length} arcs.`;
  if (!readAnchoredLine(draft.writerLine, arcsAnchor(arcs)).text.trim()) return 'Say what the shape of volume one means for whoever writes chapter one.';
  return null;
}

export interface ArcsSelectionBody {
  arcs: { optionId?: string; title: string; purpose: string; turn: string; chapters: number; rung?: string }[];
  why?: string;
  writerLine: string;
}

export function buildArcsSelection(draft: ArcsDraft, volumeChapters = 0): ArcsSelectionBody | null {
  if (arcsLockIssue(draft, volumeChapters)) return null;

  const arcs = committedArcs(draft);
  const anchor = arcsAnchor(arcs);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  const why = readAnchoredLine(draft.why, anchor).text.trim();
  return {
    arcs: arcs.map(arc => ({
      ...(arc.optionId ? { optionId: arc.optionId } : {}),
      title: arc.title.trim(),
      purpose: arc.purpose.trim(),
      turn: arc.turn.trim(),
      chapters: Math.min(Math.max(arc.chapters || ARC_CHAPTERS_MIN, ARC_CHAPTERS_MIN), ARC_CHAPTERS_MAX),
      ...(arc.rung.trim() ? { rung: arc.rung.trim() } : {}),
    })),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function arcsDraftFrom(round: ArcsRound): ArcsDraft {
  return {
    arcs: round.arcs.map(arc => ({ optionId: arc.id, title: arc.title, purpose: arc.purpose, turn: arc.turn, chapters: arc.chapters, rung: arc.rung })),
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

export function restoreArcsDraft(entries: LedgerEntryResponse[]): ArcsDraft | null {
  const decided = lockedDecision(entries, ARCS_TOPIC);
  if (!decided) return null;

  const arcs = passList(decisionPayload(decided)['arcs']).map(item => {
    const arc = item as { title?: unknown; purpose?: unknown; turn?: unknown; chapterStart?: unknown; chapterEnd?: unknown; rung?: unknown };
    const start = passNumber(arc.chapterStart, 0);
    const end = passNumber(arc.chapterEnd, 0);
    return {
      title: passText(arc.title),
      purpose: passText(arc.purpose),
      turn: passText(arc.turn),
      chapters: end > start ? end - start + 1 : ARC_CHAPTERS_MIN,
      rung: passText(arc.rung),
    };
  });
  const anchor = arcsAnchor(arcs);
  return { arcs, why: anchorLine(decided.why ?? '', anchor), writerLine: anchorLine(decided.writerLine ?? '', anchor) };
}

function resolveArcs(arcs: ArcDraft[], round: ArcsRound): ArcDraft[] {
  return arcs.map(arc => ({ ...arc, optionId: round.arcs.find(option => option.title.trim() === arc.title.trim())?.id }));
}

export function nextArcsDraft(current: ArcsDraft, offered: ArcsDraft, round: ArcsRound): ArcsDraft {
  const fresh = arcsDraftFrom(round);
  return {
    arcs: sameJson(current.arcs, offered.arcs) ? fresh.arcs : resolveArcs(current.arcs, round),
    why: current.why,
    writerLine: current.writerLine,
  };
}
