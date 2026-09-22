import { type BlueprintRoundResponse } from '@/lib/apis';

export const PREMISE_PART_KINDS = ['setting', 'rule', 'protagonist', 'hook'] as const;
export const PREMISE_PART_TEXT_MAX = 200;
export const PREMISE_SENTENCE_MAX = 600;
export const PREMISE_WRITER_LINE_MAX = 240;
export const PREMISE_WHY_MAX = 400;

export type PremisePartKind = (typeof PREMISE_PART_KINDS)[number];

export const PREMISE_PART_KIND_LABELS: Record<PremisePartKind, string> = {
  setting: 'Where it happens',
  rule: 'What it costs',
  protagonist: 'Who it happens to',
  hook: 'What makes it personal',
};

export interface PremiseAlternative {
  id: string;
  text: string;
}

export interface PremisePart {
  id: string;
  text: string;
  kind: PremisePartKind;
  alternatives: PremiseAlternative[];
}

export interface PremiseRound {
  parts: PremisePart[];
  why: string;
  writerLine: string;
}

function isPartKind(value: unknown): value is PremisePartKind {
  return typeof value === 'string' && PREMISE_PART_KINDS.includes(value as PremisePartKind);
}

/** Null for a round that is not ready, or one whose shape this build does not know. */
export function parsePremiseRound(round: BlueprintRoundResponse | null): PremiseRound | null {
  const options = round?.options as { parts?: unknown; why?: unknown; writerLine?: unknown } | null;
  if (!Array.isArray(options?.parts)) return null;
  const parts = options.parts.flatMap(candidate => {
    const part = candidate as { id?: unknown; text?: unknown; kind?: unknown; alternatives?: unknown };
    if (typeof part.id !== 'string' || typeof part.text !== 'string' || !isPartKind(part.kind)) return [];
    const alternatives = Array.isArray(part.alternatives)
      ? part.alternatives.flatMap(item => {
          const alternative = item as { id?: unknown; text?: unknown };
          return typeof alternative.id === 'string' && typeof alternative.text === 'string' ? [{ id: alternative.id, text: alternative.text }] : [];
        })
      : [];
    return [{ id: part.id, text: part.text, kind: part.kind, alternatives }];
  });
  if (parts.length === 0) return null;
  return { parts, why: typeof options.why === 'string' ? options.why : '', writerLine: typeof options.writerLine === 'string' ? options.writerLine : '' };
}

export function premiseRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export interface PremiseDraftPart {
  id: string;
  kind: PremisePartKind;
  /** The part or alternative the text came from; absent once the author has written their own. */
  optionId?: string;
  text: string;
}

/**
 * The sentence a round hands back, with the provenance the author already gave it kept: a part they wrote themselves comes back
 * as the round's text for that part, and stamping it with an option id would claim they chose something the coach offered.
 */
export function initialPremiseDraft(round: PremiseRound | null, previous: PremiseDraftPart[] = []): PremiseDraftPart[] {
  return (
    round?.parts.map(part => {
      const before = previous.find(candidate => candidate.id === part.id);
      const authored = before != null && before.optionId == null && before.text.trim() === part.text.trim();
      return { id: part.id, kind: part.kind, ...(authored ? {} : { optionId: part.id }), text: part.text };
    }) ?? []
  );
}

export function choosePremisePart(draft: PremiseDraftPart[], partId: string, choice: { optionId?: string; text: string }): PremiseDraftPart[] {
  const text = choice.text.trim();
  return draft.map(part => (part.id === partId ? { ...part, text, ...(choice.optionId ? { optionId: choice.optionId } : { optionId: undefined }) } : part));
}

export function assemblePremise(draft: PremiseDraftPart[]): string {
  return draft
    .map(part => part.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PremiseSelection {
  parts: { optionId?: string; text: string }[];
  sentence: string;
  why?: string;
  writerLine: string;
}

export interface PremiseLines {
  why: string;
  writerLine: string;
}

/** The lines belong to one sentence: the one they were written for. Change the sentence and they have to be said again. */
export interface PremiseLinesDraft extends PremiseLines {
  forSentence: string;
}

export function initialPremiseLines(round: PremiseRound | null, draft: PremiseDraftPart[]): PremiseLinesDraft {
  return { why: round?.why ?? '', writerLine: round?.writerLine ?? '', forSentence: assemblePremise(draft) };
}

export interface PremiseLinesView extends PremiseLines {
  /** The sentence moved under the lines: they describe a premise the author is no longer locking. */
  stale: boolean;
}

/** A round that named a part reworked that part's alternatives; one that named none rewrote the whole sentence. */
export function isFocusedPremiseRound(round: BlueprintRoundResponse | null): boolean {
  return typeof (round?.input as PremiseRoundInput | null | undefined)?.part === 'string';
}

/**
 * Which lines survive a new round. Lines the author's current sentence still owns are kept whatever the round did. Otherwise only a
 * whole rewrite brings its own: a focused round carries the lines it already had, and re-adopting those would launder a line written
 * for a sentence the author has since changed back in as if it described this one.
 */
export function nextPremiseLines(current: PremiseLinesDraft, round: PremiseRound | null, draft: PremiseDraftPart[], focused: boolean): PremiseLinesDraft {
  if (current.forSentence === assemblePremise(draft)) return current;
  return focused ? current : initialPremiseLines(round, draft);
}

export function premiseLinesFor(lines: PremiseLinesDraft, sentence: string): PremiseLinesView {
  const stale = lines.forSentence !== sentence;
  return { why: stale ? '' : lines.why, writerLine: stale ? '' : lines.writerLine, stale };
}

/** The writer line rides every chapter pack, so a lock without one is refused rather than filled in from a discarded sentence. */
export function buildPremiseSelection(draft: PremiseDraftPart[], lines: PremiseLines): PremiseSelection | null {
  const parts = draft.map(part => ({ ...(part.optionId ? { optionId: part.optionId } : {}), text: part.text.trim() })).filter(part => part.text.length > 0);
  const sentence = assemblePremise(draft);
  const writerLine = lines.writerLine.trim();
  const why = lines.why.trim();
  if (parts.length === 0 || !sentence || !writerLine) return null;
  return { parts, sentence: sentence.slice(0, PREMISE_SENTENCE_MAX), ...(why ? { why } : {}), writerLine };
}

export const PREMISE_PREVIEW_MIN_LENGTH = 20;

/** What the preview endpoint will accept: it refuses anything past its own maximum, so the screen never asks for a call that cannot land. */
export function previewPremiseText(sentence: string): string {
  return sentence.trim().slice(0, PREMISE_SENTENCE_MAX);
}

export function canPreviewPremise(sentence: string): boolean {
  return previewPremiseText(sentence).length >= PREMISE_PREVIEW_MIN_LENGTH;
}

export interface PremiseRoundInput {
  part?: string;
  current?: { id: string; text: string }[];
}

/** What the next round works from: the sentence as it stands, and the one part the author opened, if any. */
export function buildPremiseInput(draft: PremiseDraftPart[], partId?: string | null): PremiseRoundInput {
  const current = draft.map(part => ({ id: part.id, text: part.text.trim() })).filter(part => part.text.length > 0);
  return { ...(partId ? { part: partId } : {}), ...(current.length > 0 ? { current } : {}) };
}

/** A re-run with nothing on screen still carries the sentence the round being steered was built from. */
export function resolvePremiseInput(draft: PremiseDraftPart[], partId: string | null, round: BlueprintRoundResponse | null): PremiseRoundInput {
  const built = buildPremiseInput(draft, partId);
  if (built.current) return built;
  const stored = round?.input as PremiseRoundInput | null | undefined;
  const current = Array.isArray(stored?.current) ? stored.current : undefined;
  return { ...(partId ? { part: partId } : {}), ...(current ? { current } : {}) };
}

/** What the decision card shows as rejected: every part and alternative the sentence passed over. */
export function passedOverAlternatives(round: PremiseRound | null, draft: PremiseDraftPart[]): string[] {
  if (!round) return [];
  const chosen = new Set(draft.map(part => part.text.trim().toLowerCase()));
  const offered = round.parts.flatMap(part => [part.text, ...part.alternatives.map(alternative => alternative.text)]);
  return [...new Set(offered.filter(text => !chosen.has(text.trim().toLowerCase())))];
}
