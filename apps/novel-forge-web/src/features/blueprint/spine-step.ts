import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passStrings, passText, sameJson } from './engine-pass';

export const SPINE_TOPIC = 'spine';
export const SPINE_REVEALS_TOPIC = 'spine.reveals';
export const SPINE_NAME_MAX = 80;
export const SPINE_LINE_MAX = 200;
export const SPINE_TEXT_MAX = 600;
export const SPINE_WRITER_LINE_MAX = 240;
export const MOVEMENTS_MAX = 8;
export const REVEALS_MAX = 8;
export const MOVEMENT_CHAPTERS_MIN = 5;
export const MOVEMENT_CHAPTERS_MAX = 300;

export type SpineMode = 'movements' | 'seasons';

/** Slice of life asks the same two questions in its own words: seasons of a life, and the milestones it passes. */
export const SPINE_LABELS: Record<SpineMode, { movements: string; movement: string; reveals: string; reveal: string }> = {
  movements: { movements: 'Movements', movement: 'Movement', reveals: 'Reveal schedule', reveal: 'Reveal' },
  seasons: { movements: 'Seasons of a life', movement: 'Season', reveals: 'Milestones', reveal: 'Milestone' },
};

export interface MovementOption {
  id: string;
  title: string;
  summary: string;
  change: string;
  chapters: number;
}

export interface RevealOption {
  id: string;
  movement: number;
  when: string;
  truth: string;
  writerNote: string;
  terms: string[];
  pinned: boolean;
}

export interface SpineRound {
  mode: SpineMode;
  endingQuestion: string;
  revealsRequired: boolean;
  movements: MovementOption[];
  reveals: RevealOption[];
  note: string;
}

function passNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function parseSpineRound(round: BlueprintRoundResponse | null): SpineRound {
  const options = round?.options as { mode?: unknown; endingQuestion?: unknown; revealsRequired?: unknown; movements?: unknown; reveals?: unknown; note?: unknown } | null;
  const movements = passList(options?.movements).flatMap(item => {
    const movement = item as Partial<MovementOption>;
    return typeof movement.id === 'string'
      ? [{ id: movement.id, title: passText(movement.title), summary: passText(movement.summary), change: passText(movement.change), chapters: passNumber(movement.chapters, 0) }]
      : [];
  });
  const reveals = passList(options?.reveals).flatMap(item => {
    const reveal = item as Partial<RevealOption>;
    return typeof reveal.id === 'string'
      ? [
          {
            id: reveal.id,
            movement: passNumber(reveal.movement, 1),
            when: passText(reveal.when),
            truth: passText(reveal.truth),
            writerNote: passText(reveal.writerNote),
            terms: passStrings(reveal.terms),
            pinned: reveal.pinned === true,
          },
        ]
      : [];
  });
  return {
    mode: options?.mode === 'seasons' ? 'seasons' : 'movements',
    endingQuestion: passText(options?.endingQuestion),
    revealsRequired: options?.revealsRequired === true,
    movements,
    reveals,
    note: passText(options?.note),
  };
}

export interface MovementDraft {
  optionId?: string;
  title: string;
  summary: string;
  change: string;
  chapters: number;
}

export interface RevealDraft {
  optionId?: string;
  movement: number;
  when: string;
  truth: string;
  /** The only part of a reveal the chapter writer is ever shown, so it must instruct without telling. */
  writerNote: string;
  /** Give-away phrases, as the author types them: one line, comma separated. */
  terms: string;
}

export interface SpineDraft {
  movements: MovementDraft[];
  reveals: RevealDraft[];
  note: string;
  why: AnchoredLine;
  writerLine: AnchoredLine;
  revealsWriterLine: AnchoredLine;
}

/** The shape as one line: what the decision's statement is, and so what its free-text lines are written about. */
export function spineAnchor(movements: MovementDraft[]): string {
  return movements
    .filter(movement => movement.title.trim())
    .map(movement => movement.title.trim())
    .join(' → ');
}

export function revealsAnchor(reveals: RevealDraft[]): string {
  return reveals
    .filter(reveal => reveal.when.trim() && reveal.truth.trim())
    .map(reveal => `${reveal.when.trim()}: ${reveal.truth.trim()}`)
    .join(' · ');
}

/** Renaming a movement makes it the author's own; its summary, change and length are theirs to edit either way. */
export function editMovement(movements: MovementDraft[], index: number, patch: Partial<Omit<MovementDraft, 'optionId'>>): MovementDraft[] {
  const next = movements.map((movement, at) => {
    if (at !== index) return movement;
    const title = patch.title ?? movement.title;
    return { ...movement, ...patch, ...(title.trim() === movement.title.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((movement, at) => movement.title.trim().length > 0 || at === index);
}

export function editReveal(reveals: RevealDraft[], index: number, patch: Partial<Omit<RevealDraft, 'optionId'>>): RevealDraft[] {
  const next = reveals.map((reveal, at) => {
    if (at !== index) return reveal;
    const truth = patch.truth ?? reveal.truth;
    return { ...reveal, ...patch, ...(truth.trim() === reveal.truth.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((reveal, at) => reveal.truth.trim().length > 0 || reveal.when.trim().length > 0 || at === index);
}

export function parseTerms(terms: string): string[] {
  return terms
    .split(',')
    .map(term => term.trim())
    .filter(Boolean);
}

/** Exactly the movements and reveals a lock would carry, which is what every line on screen is anchored to. */
export function committedMovements(draft: SpineDraft): MovementDraft[] {
  return draft.movements.filter(movement => movement.title.trim() && movement.summary.trim() && movement.change.trim()).slice(0, MOVEMENTS_MAX);
}

export function committedReveals(draft: SpineDraft): RevealDraft[] {
  return draft.reveals.filter(reveal => reveal.when.trim() && reveal.truth.trim() && reveal.writerNote.trim()).slice(0, REVEALS_MAX);
}

export function spineDraftAnchor(draft: SpineDraft): string {
  return spineAnchor(committedMovements(draft));
}

export function spineRevealsDraftAnchor(draft: SpineDraft): string {
  return revealsAnchor(committedReveals(draft));
}

/** Why the lock is unavailable, in the author's words. `buildSpineSelection` refuses exactly when this answers. */
export function spineLockIssue(draft: SpineDraft, round: SpineRound): string | null {
  const movements = committedMovements(draft);
  if (movements.length === 0) return 'Every movement needs a name, what happens in it, and what changes in the protagonist there.';
  if (!readAnchoredLine(draft.writerLine, spineAnchor(movements)).text.trim()) return 'Say what the shape of the novel means for whoever writes chapter one.';

  const reveals = committedReveals(draft);
  const half = draft.reveals.find(reveal => (reveal.when.trim() || reveal.truth.trim()) && !reveals.includes(reveal));
  if (half) return 'Every reveal needs where it comes out, the truth itself, and a note telling the earlier chapters how to hold it without stating it.';
  if (round.revealsRequired && reveals.length === 0) return 'Mystery drives this novel, so say where at least one big truth comes out.';

  const told = reveals.find(reveal => reveal.writerNote.trim().toLowerCase().includes(reveal.truth.trim().toLowerCase()));
  if (told) return `The note for “${told.when.trim()}” states the truth it is meant to withhold — it is the one part of it the writer is shown.`;
  return null;
}

export interface SpineSelectionBody {
  movements: { optionId?: string; title: string; summary: string; change: string; chapters: number }[];
  reveals?: { optionId?: string; movement: number; when: string; truth: string; writerNote: string; terms?: string[] }[];
  note?: string;
  why?: string;
  writerLine: string;
  revealsWriterLine?: string;
}

export function buildSpineSelection(draft: SpineDraft, round: SpineRound): SpineSelectionBody | null {
  if (spineLockIssue(draft, round)) return null;

  const movements = committedMovements(draft);
  const reveals = committedReveals(draft);
  const anchor = spineAnchor(movements);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  const why = readAnchoredLine(draft.why, anchor).text.trim();
  const revealsWriterLine = readAnchoredLine(draft.revealsWriterLine, revealsAnchor(reveals)).text.trim();
  const note = draft.note.trim();

  return {
    movements: movements.map(movement => ({
      ...(movement.optionId ? { optionId: movement.optionId } : {}),
      title: movement.title.trim(),
      summary: movement.summary.trim(),
      change: movement.change.trim(),
      chapters: Math.min(Math.max(movement.chapters || MOVEMENT_CHAPTERS_MIN, MOVEMENT_CHAPTERS_MIN), MOVEMENT_CHAPTERS_MAX),
    })),
    ...(reveals.length > 0
      ? {
          reveals: reveals.map(reveal => {
            const terms = parseTerms(reveal.terms);
            return {
              ...(reveal.optionId ? { optionId: reveal.optionId } : {}),
              movement: Math.min(Math.max(reveal.movement, 1), movements.length),
              when: reveal.when.trim(),
              truth: reveal.truth.trim(),
              writerNote: reveal.writerNote.trim(),
              ...(terms.length > 0 ? { terms } : {}),
            };
          }),
        }
      : {}),
    ...(note ? { note } : {}),
    ...(why ? { why } : {}),
    writerLine,
    ...(revealsWriterLine ? { revealsWriterLine } : {}),
  };
}

export function spineDraftFrom(round: SpineRound): SpineDraft {
  return {
    movements: round.movements.map(movement => ({ optionId: movement.id, title: movement.title, summary: movement.summary, change: movement.change, chapters: movement.chapters })),
    reveals: round.reveals.map(reveal => ({
      optionId: reveal.id,
      movement: reveal.movement,
      when: reveal.when,
      truth: reveal.truth,
      writerNote: reveal.writerNote,
      terms: reveal.terms.join(', '),
    })),
    note: round.note,
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
    revealsWriterLine: EMPTY_ANCHORED_LINE,
  };
}

/** Both decisions this screen wrote, read back together: one lock writes the whole answer, so half of it on screen would retire the other half. */
export function restoreSpineDraft(entries: LedgerEntryResponse[]): SpineDraft | null {
  const shape = lockedDecision(entries, SPINE_TOPIC);
  const schedule = lockedDecision(entries, SPINE_REVEALS_TOPIC);
  if (!shape && !schedule) return null;

  const payload = decisionPayload(shape);
  const movements = passList(payload['movements']).map(item => {
    const movement = item as { title?: unknown; summary?: unknown; change?: unknown; chapters?: unknown };
    return { title: passText(movement.title), summary: passText(movement.summary), change: passText(movement.change), chapters: passNumber(movement.chapters, 0) };
  });
  const reveals = passList(decisionPayload(schedule)['reveals']).map(item => {
    const reveal = item as { movement?: unknown; when?: unknown; truth?: unknown; writerNote?: unknown; terms?: unknown };
    return {
      movement: passNumber(reveal.movement, 1),
      when: passText(reveal.when),
      truth: passText(reveal.truth),
      writerNote: passText(reveal.writerNote),
      terms: passStrings(reveal.terms).join(', '),
    };
  });

  const anchor = spineAnchor(movements);
  return {
    movements,
    reveals,
    note: passText(payload['note']),
    why: anchorLine(shape?.why ?? '', anchor),
    writerLine: anchorLine(shape?.writerLine ?? '', anchor),
    revealsWriterLine: anchorLine(schedule?.writerLine ?? '', revealsAnchor(reveals)),
  };
}

function resolveMovements(movements: MovementDraft[], round: SpineRound): MovementDraft[] {
  return movements.map(movement => ({ ...movement, optionId: round.movements.find(option => option.title.trim() === movement.title.trim())?.id }));
}

function resolveReveals(reveals: RevealDraft[], round: SpineRound): RevealDraft[] {
  return reveals.map(reveal => ({ ...reveal, optionId: round.reveals.find(option => option.truth.trim() === reveal.truth.trim())?.id }));
}

/**
 * What survives a new round: what the author never touched takes the round's new answer, and what they wrote or locked stays theirs with
 * its round-local ids resolved again by text, since `mv1` of the round before names a different movement now.
 */
export function nextSpineDraft(current: SpineDraft, offered: SpineDraft, round: SpineRound): SpineDraft {
  const fresh = spineDraftFrom(round);
  return {
    movements: sameJson(current.movements, offered.movements) ? fresh.movements : resolveMovements(current.movements, round),
    reveals: sameJson(current.reveals, offered.reveals) ? fresh.reveals : resolveReveals(current.reveals, round),
    note: sameJson(current.note, offered.note) ? fresh.note : current.note,
    why: current.why,
    writerLine: current.writerLine,
    revealsWriterLine: current.revealsWriterLine,
  };
}
