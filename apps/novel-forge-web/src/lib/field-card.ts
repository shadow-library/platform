export type FieldValue = { kind: 'empty' } | { kind: 'filled'; text: string; words: number; expandable: boolean };

export const CLAMP_LINES = 3;

/**
 * A 300px panel fits roughly 110 characters in three 13px lines, so the threshold sits below the
 * narrowest capacity: a value the clamp can cut always offers the sheet, and the redundant offers
 * that buys land on values the sheet still reads better than the panel does.
 */
export const EXPAND_CHARS = 100;

const WORD = /[\p{L}\p{N}]/u;

export function countWords(text: string): number {
  return text.split(/\s+/u).filter(token => WORD.test(token)).length;
}

export function formatWordCount(words: number): string {
  return words === 1 ? '1 word' : `${words} words`;
}

export function resolveFieldValue(value: string | null | undefined): FieldValue {
  const text = value?.trim() ?? '';
  if (text === '') return { kind: 'empty' };
  return { kind: 'filled', text, words: countWords(text), expandable: text.includes('\n') || text.length > EXPAND_CHARS };
}

/** Blank lines would spend the clamp on whitespace, so the preview keeps the breaks and drops the gaps. */
export function previewText(text: string): string {
  return text.replace(/\n\s*\n+/gu, '\n');
}

export function readAllText(words: number): string {
  return `Read all ${formatWordCount(words)}`;
}

export function readAllLabel(label: string, words: number): string {
  return `${readAllText(words)} of ${label}`;
}
