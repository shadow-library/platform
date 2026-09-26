import { notesParagraphs } from '../ai/context/novel-chat-context';
import { contentTokens, quoteFoundIn, quoteIsTentative } from '../refinement/write-policy';

/** The notes an organise round read, split as `get_notes` numbers them, so every ¶ the round cites means the paragraph the author sees. */
export interface NotesSource {
  notes: string;
  paragraphs: string[];
}

export interface Cited {
  quote?: string;
  paragraphs: number[];
}

export function notesSource(notes: string): NotesSource {
  return { notes, paragraphs: notesParagraphs(notes) };
}

/** A quote counts only when the server finds it in the notes, stated rather than asked or hedged, and the model said the notes state it. */
export function verifiedQuote(source: NotesSource, quote: string | undefined, stated: boolean): string | undefined {
  const trimmed = quote?.trim();
  if (!stated || !trimmed) return undefined;
  return quoteFoundIn(trimmed, source.notes) && !quoteIsTentative(trimmed, source.notes) ? trimmed : undefined;
}

const OVERLAP_SHARE = 0.3;
const OVERLAP_CEILING = 3;

/** An entry draws on a paragraph when they share enough content words: a third of the entry's, never more than three nor fewer than one. */
function drawsOn(text: string, paragraph: string): boolean {
  const own = new Set(contentTokens(text));
  if (own.size === 0) return false;
  const theirs = new Set(contentTokens(paragraph));
  const shared = [...own].filter(token => theirs.has(token)).length;
  return shared >= Math.max(1, Math.min(OVERLAP_CEILING, Math.ceil(own.size * OVERLAP_SHARE)));
}

/**
 * Every paragraph a verified quote is found in, and each cited paragraph the entry's own words overlap — never a number the model cited
 * alone, so "not used yet" errs towards showing a paragraph rather than hiding one.
 */
export function citedParagraphs(source: NotesSource, cited: readonly number[] | undefined, quote: string | undefined, text: string): number[] {
  const count = source.paragraphs.length;
  const valid = (cited ?? []).filter(number => Number.isInteger(number) && number >= 1 && number <= count && drawsOn(text, source.paragraphs[number - 1] ?? ''));
  const quoted = quote ? source.paragraphs.flatMap((paragraph, index) => (quoteFoundIn(quote, paragraph) ? [index + 1] : [])) : [];
  return [...new Set([...valid, ...quoted])].sort((a, b) => a - b);
}

export function mergeCited(first: Cited, second: Cited): Cited {
  const quote = first.quote && second.quote ? first.quote : undefined;
  return { quote, paragraphs: [...new Set([...first.paragraphs, ...second.paragraphs])].sort((a, b) => a - b) };
}

export function unusedParagraphs(count: number, used: Iterable<number>): number[] {
  const taken = new Set(used);
  return Array.from({ length: count }, (_, index) => index + 1).filter(number => !taken.has(number));
}
