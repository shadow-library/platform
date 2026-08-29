import { type BriefBodyInput, CONTINUES_LINE, HANDOFF_PREFIX, renderBriefBody, STARTS_LINE } from './brief-body';

const CHAPTER_REF = String.raw`\b(?<refWord>chapter):(?<ref>\d+)\b`;
const CHAPTER_RANGE = String.raw`\b(?<rangeWord>chapters?|chs?)(?<rangeGap>\.?\s*#?)(?<from>\d+)(?<sep>\s*(?:[-–—]|to|through)\s*#?)(?<to>\d+)\b`;
const CHAPTER_MENTION = String.raw`\b(?<word>chapters?|chs?)(?<gap>\.?\s*#?)(?<num>\d+)\b`;

// One alternation, one pass: applying the range and mention patterns separately would shift a range's
// lower bound twice, since the mention pattern still matches inside an already-rewritten range.
const CHAPTER_TOKEN = new RegExp(`${CHAPTER_REF}|${CHAPTER_RANGE}|${CHAPTER_MENTION}`, 'gi');

export function shiftChapterNumber(chapter: number, afterChapter: number, delta = 1): number {
  return chapter > afterChapter ? chapter + delta : chapter;
}

/** Rewrites `chapter:N` refs and `chapter N` / `chs 3–7` prose mentions; every other number is left alone. */
export function shiftChapterMentions(text: string, afterChapter: number, delta = 1): string {
  const shift = (raw: string): number => shiftChapterNumber(Number(raw), afterChapter, delta);
  return text.replace(CHAPTER_TOKEN, (match: string, ...args: unknown[]) => {
    const groups = args.at(-1) as Record<string, string | undefined>;
    if (groups['ref'] !== undefined) return `${groups['refWord']}:${shift(groups['ref'])}`;
    if (groups['from'] !== undefined && groups['to'] !== undefined) {
      return `${groups['rangeWord']}${groups['rangeGap']}${shift(groups['from'])}${groups['sep']}${shift(groups['to'])}`;
    }
    if (groups['num'] !== undefined) return `${groups['word']}${groups['gap']}${shift(groups['num'])}`;
    return match;
  });
}

/** Walks a jsonb value and rewrites chapter references inside its strings; numbers carry no chapter semantics in any stored contract. */
export function shiftChapterReferences<T>(value: T, afterChapter: number, delta = 1): T {
  if (typeof value === 'string') return shiftChapterMentions(value, afterChapter, delta) as T;
  if (Array.isArray(value)) return value.map(item => shiftChapterReferences(item, afterChapter, delta)) as T;
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, shiftChapterReferences(item, afterChapter, delta)]);
  return Object.fromEntries(entries) as T;
}

/**
 * Inverse of `renderBriefBody`. The continuation markers are only ever appended, in this order, so
 * peeling them off the tail — rather than matching anywhere — keeps the round trip byte-identical
 * for a body whose objective or events happen to contain the same text.
 */
export function parseBriefBody(body: string): BriefBodyInput {
  const lines = body.split('\n');
  const parsed: BriefBodyInput = { objective: '', events: [] };

  const handoff = lines.at(-1);
  if (handoff !== undefined && handoff.startsWith(HANDOFF_PREFIX) && handoff.length > HANDOFF_PREFIX.length) {
    parsed.handoffBeat = handoff.slice(HANDOFF_PREFIX.length);
    lines.pop();
  }
  if (lines.at(-1) === STARTS_LINE) {
    parsed.startsFromPreviousChapter = true;
    lines.pop();
  }
  if (lines.at(-1) === CONTINUES_LINE) {
    parsed.continuesIntoNextChapter = true;
    lines.pop();
  }

  parsed.objective = lines.shift() ?? '';
  parsed.events = lines;
  return parsed;
}

/** Re-renders a shifted brief's body so chapter numbers quoted in its own prose follow the renumber. */
export function shiftBriefBody(body: string, afterChapter: number, delta = 1): string {
  const parsed = parseBriefBody(body);
  return renderBriefBody({
    ...parsed,
    objective: shiftChapterMentions(parsed.objective, afterChapter, delta),
    events: parsed.events.map(event => shiftChapterMentions(event, afterChapter, delta)),
    handoffBeat: parsed.handoffBeat === undefined ? undefined : shiftChapterMentions(parsed.handoffBeat, afterChapter, delta),
  });
}
