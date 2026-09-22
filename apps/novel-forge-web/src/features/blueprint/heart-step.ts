import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

export const THEME_TOPIC = 'theme';
export const ENDING_TOPIC = 'ending';
export const HEART_TEXT_MAX = 200;
export const HEART_WHY_MAX = 240;
export const HEART_WRITER_LINE_MAX = 240;

export type HeartPart = 'theme' | 'ending';

export interface HeartOption {
  id: string;
  text: string;
  why: string;
  /** What the coach says is weaker about this option; the screen never hides it. */
  caution?: string;
  writerLine: string;
}

export interface HeartRound {
  themes: HeartOption[];
  endings: HeartOption[];
}

function parseOptions(value: unknown): HeartOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(candidate => {
    const option = candidate as { id?: unknown; text?: unknown; why?: unknown; caution?: unknown; writerLine?: unknown };
    if (typeof option.id !== 'string' || typeof option.text !== 'string') return [];
    return [
      {
        id: option.id,
        text: option.text,
        why: typeof option.why === 'string' ? option.why : '',
        ...(typeof option.caution === 'string' && option.caution ? { caution: option.caution } : {}),
        writerLine: typeof option.writerLine === 'string' ? option.writerLine : '',
      },
    ];
  });
}

/** A round from a step version this build does not know reads as no options, never as a crash on a screen the author is looking at. */
export function parseHeartRound(round: BlueprintRoundResponse | null): HeartRound {
  const options = round?.options as { themes?: unknown; endings?: unknown } | null;
  return { themes: parseOptions(options?.themes), endings: parseOptions(options?.endings) };
}

export function heartRoundKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export interface HeartAnswer {
  /** The option the text came from; absent once the author has written their own. */
  optionId?: string;
  text: string;
  why: string;
  writerLine: string;
  /** The wording `why` was written for. */
  whyFor: string;
  /** The wording `writerLine` was written for. Stamped apart from `why`, so saying one never speaks for the other. */
  writerLineFor: string;
}

export const EMPTY_HEART_ANSWER: HeartAnswer = { text: '', why: '', writerLine: '', whyFor: '', writerLineFor: '' };

export type HeartAnswers = Record<HeartPart, HeartAnswer>;

export const EMPTY_HEART_ANSWERS: HeartAnswers = { theme: EMPTY_HEART_ANSWER, ending: EMPTY_HEART_ANSWER };

const same = (left: string, right: string): boolean => left.trim() === right.trim();

export function chooseHeartOption(option: HeartOption): HeartAnswer {
  return { optionId: option.id, text: option.text, why: option.why, writerLine: option.writerLine, whyFor: option.text, writerLineFor: option.text };
}

/**
 * Editing the text makes the answer the author's own — the ledger would otherwise claim they chose what the coach offered — and
 * strands both lines, which were written about wording they have left behind. Each line carries its own stamp, so writing one
 * re-anchors only itself: a `why` typed after a rewrite can never revive the writer line that rewrite left behind, and the writer
 * line rides every chapter pack.
 */
export function editHeartAnswer(answer: HeartAnswer, patch: Partial<Pick<HeartAnswer, 'text' | 'why' | 'writerLine'>>): HeartAnswer {
  const text = patch.text ?? answer.text;
  const rewritten = !same(text, answer.text);
  return {
    ...(rewritten || answer.optionId === undefined ? {} : { optionId: answer.optionId }),
    text,
    why: patch.why ?? answer.why,
    writerLine: patch.writerLine ?? answer.writerLine,
    whyFor: patch.why === undefined ? answer.whyFor : text,
    writerLineFor: patch.writerLine === undefined ? answer.writerLineFor : text,
  };
}

export interface HeartAnswerView {
  why: string;
  writerLine: string;
  /** A line the text has moved out from under: it describes an answer the author is no longer locking, so it is not shown or sent. */
  whyStale: boolean;
  writerLineStale: boolean;
  stale: boolean;
}

export function heartAnswerFor(answer: HeartAnswer): HeartAnswerView {
  const whyStale = !same(answer.whyFor, answer.text);
  const writerLineStale = !same(answer.writerLineFor, answer.text);
  return { why: whyStale ? '' : answer.why, writerLine: writerLineStale ? '' : answer.writerLine, whyStale, writerLineStale, stale: whyStale || writerLineStale };
}

export interface HeartAnswerBody {
  optionId?: string;
  text: string;
  why?: string;
  writerLine: string;
}

export interface HeartSelection {
  theme: HeartAnswerBody;
  ending: HeartAnswerBody;
}

function answerBody(answer: HeartAnswer): HeartAnswerBody | null {
  const text = answer.text.trim();
  const lines = heartAnswerFor(answer);
  const writerLine = lines.writerLine.trim();
  const why = lines.why.trim();
  if (!text || !writerLine) return null;
  return { ...(answer.optionId ? { optionId: answer.optionId } : {}), text, ...(why ? { why } : {}), writerLine };
}

/** Both halves are one answer: a lock that carries only one of them would retire the other. */
export function buildHeartSelection(answers: HeartAnswers): HeartSelection | null {
  const theme = answerBody(answers.theme);
  const ending = answerBody(answers.ending);
  return theme && ending ? { theme, ending } : null;
}

/**
 * The theme and the ending question already in the Notebook, read back so a revisit locks the whole answer rather than the half
 * still on screen. The option id is deliberately dropped: ids are round-local, so a restored answer is the author's own text.
 */
export function restoreHeartAnswers(entries: LedgerEntryResponse[]): Partial<HeartAnswers> {
  const restored: Partial<HeartAnswers> = {};
  for (const entry of entries) {
    if (entry.kind !== 'decision') continue;
    const part: HeartPart | null = entry.topic === THEME_TOPIC ? 'theme' : entry.topic === ENDING_TOPIC ? 'ending' : null;
    if (part === null) continue;
    restored[part] = { text: entry.statement, why: entry.why ?? '', writerLine: entry.writerLine ?? '', whyFor: entry.statement, writerLineFor: entry.statement };
  }
  return restored;
}

export function mergeHeartAnswers(restored: Partial<HeartAnswers>, touched: Partial<HeartAnswers>): HeartAnswers {
  return {
    theme: touched.theme ?? restored.theme ?? EMPTY_HEART_ANSWER,
    ending: touched.ending ?? restored.ending ?? EMPTY_HEART_ANSWER,
  };
}
