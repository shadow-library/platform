import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

export const TASTE_VERDICTS = ['a', 'b', 'both', 'neither', 'depends'] as const;
export const TASTE_TOPIC = 'taste';
export const TASTE_GAVE_UP_TOPIC = 'taste.gave_up';
export const TASTE_PAIR_MAX = 16;
export const TASTE_NOTE_MAX = 300;
export const TASTE_OWN_REASON_MAX = 120;
export const TASTE_OWN_REASONS_MAX = 5;

export type TasteVerdictValue = (typeof TASTE_VERDICTS)[number];

export const TASTE_ASIDE_LABELS: Record<'both' | 'neither' | 'depends', string> = {
  both: 'Both',
  neither: 'Neither',
  depends: 'Depends…',
};

export interface TasteSide {
  text: string;
  label: string;
}

export interface TastePair {
  id: string;
  a: TasteSide;
  b: TasteSide;
}

export interface TasteReason {
  id: string;
  label: string;
}

export interface TasteRound {
  pairs: TastePair[];
  giveUpReasons: TasteReason[];
}

export interface TasteAnswer {
  verdict: TasteVerdictValue;
  note?: string;
}

export type TasteAnswers = Record<string, TasteAnswer>;

function parseSide(value: unknown): TasteSide | null {
  const side = value as { text?: unknown; label?: unknown } | null;
  if (typeof side?.text !== 'string' || typeof side.label !== 'string') return null;
  return { text: side.text, label: side.label };
}

/** A round from a step version this build does not know reads as no pairs, never as a crash on a screen the author is looking at. */
export function parseTasteRound(round: BlueprintRoundResponse | null): TasteRound {
  const options = round?.options as { pairs?: unknown; giveUpReasons?: unknown } | null;
  const pairs = Array.isArray(options?.pairs)
    ? options.pairs.flatMap(candidate => {
        const pair = candidate as { id?: unknown; a?: unknown; b?: unknown };
        const a = parseSide(pair.a);
        const b = parseSide(pair.b);
        return typeof pair.id === 'string' && a && b ? [{ id: pair.id, a, b }] : [];
      })
    : [];
  const giveUpReasons = Array.isArray(options?.giveUpReasons)
    ? options.giveUpReasons.flatMap(candidate => {
        const reason = candidate as { id?: unknown; label?: unknown };
        return typeof reason.id === 'string' && typeof reason.label === 'string' ? [{ id: reason.id, label: reason.label }] : [];
      })
    : [];
  return { pairs, giveUpReasons };
}

/** The pairs and their answers both change when a round opens and again when its options arrive; both are the same round id. */
export function tasteRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export function answerPair(answers: TasteAnswers, pairId: string, answer: TasteAnswer | null): TasteAnswers {
  const next = { ...answers };
  if (answer == null) delete next[pairId];
  else next[pairId] = answer;
  return next;
}

export interface TasteVerdictBody {
  optionId: string;
  verdict: TasteVerdictValue;
  note?: string;
}

export interface TasteSelection {
  verdicts: TasteVerdictBody[];
  reasonIds?: string[];
  ownReasons?: string[];
}

/** An unfinished "depends" carries nothing to save, so it is left out rather than sent for the server to refuse. */
export function buildTasteSelection(round: TasteRound, answers: TasteAnswers, reasonIds: string[], ownReasons: string[]): TasteSelection {
  const offered = new Set(round.pairs.map(pair => pair.id));
  const offeredReasons = new Set(round.giveUpReasons.map(reason => reason.id));
  const verdicts = Object.entries(answers).flatMap(([optionId, answer]): TasteVerdictBody[] => {
    if (!offered.has(optionId)) return [];
    const note = answer.note?.trim();
    if (answer.verdict === 'depends') return note ? [{ optionId, verdict: 'depends', note }] : [];
    return [{ optionId, verdict: answer.verdict }];
  });
  const written = [...new Set(ownReasons.map(reason => reason.trim()).filter(Boolean))].slice(0, TASTE_OWN_REASONS_MAX);
  const chosen = reasonIds.filter(id => offeredReasons.has(id));
  return { verdicts, ...(chosen.length > 0 ? { reasonIds: chosen } : {}), ...(written.length > 0 ? { ownReasons: written } : {}) };
}

export function hasTasteAnswer(selection: TasteSelection): boolean {
  return selection.verdicts.length > 0 || (selection.reasonIds?.length ?? 0) > 0 || (selection.ownReasons?.length ?? 0) > 0;
}

export function toggleReason(reasonIds: string[], reasonId: string): string[] {
  return reasonIds.includes(reasonId) ? reasonIds.filter(id => id !== reasonId) : [...reasonIds, reasonId];
}

/** Where a fresh visit opens: the first pair with no answer, or the last one once they all have. */
export function firstUnansweredPair(pairs: TastePair[], answers: TasteAnswers): number {
  const next = pairs.findIndex(pair => answers[pair.id] == null);
  return next === -1 ? Math.max(0, pairs.length - 1) : next;
}

export interface RestoredTaste {
  answers: TasteAnswers;
  reasonIds: string[];
  ownReasons: string[];
}

function payloadOf(entry: LedgerEntryResponse): { optionId?: string; verdict?: string } {
  const payload = entry.payload as { optionId?: unknown; verdict?: unknown } | null;
  return {
    ...(typeof payload?.optionId === 'string' ? { optionId: payload.optionId } : {}),
    ...(typeof payload?.verdict === 'string' ? { verdict: payload.verdict } : {}),
  };
}

function isVerdict(value: string | undefined): value is TasteVerdictValue {
  return TASTE_VERDICTS.includes(value as TasteVerdictValue);
}

/**
 * The answers already in the Notebook, read back so a revisit locks the whole answer rather than the part still on screen —
 * one lock writes the step's whole answer, so an answer the screen has forgotten is an answer the lock retires.
 */
export function restoreTasteAnswers(entries: LedgerEntryResponse[]): RestoredTaste {
  const restored: RestoredTaste = { answers: {}, reasonIds: [], ownReasons: [] };
  for (const entry of entries) {
    const { optionId, verdict } = payloadOf(entry);
    if (entry.topic === TASTE_TOPIC && optionId && isVerdict(verdict)) {
      restored.answers[optionId] = { verdict, ...(verdict === 'depends' ? { note: entry.statement } : {}) };
      continue;
    }
    if (entry.topic !== TASTE_GAVE_UP_TOPIC || entry.kind !== 'rejected') continue;
    if (optionId) restored.reasonIds.push(optionId);
    else restored.ownReasons.push(entry.statement);
  }
  return { ...restored, reasonIds: [...new Set(restored.reasonIds)], ownReasons: [...new Set(restored.ownReasons)] };
}
