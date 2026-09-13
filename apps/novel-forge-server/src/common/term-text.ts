const EXCERPT_RADIUS = 60;

// A term matches case-sensitively (whole term, even if multi-word) when any of its space-separated
// words is an ordinary English word ("Long", "Han") a name might collide with, so a lowercase
// sentence doesn't false-positive; every other term matches case-insensitively.
export const COMMON_WORD_ALLOWLIST = new Set([
  'long',
  'han',
  'sun',
  'may',
  'min',
  'wu',
  'hu',
  'chi',
  'song',
  'lin',
  'ming',
  'sky',
  'rose',
  'jade',
  'grace',
  'joy',
  'east',
  'west',
  'will',
]);

export function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isCaseInsensitiveTerm(term: string): boolean {
  return !term.split(/\s+/).some(word => COMMON_WORD_ALLOWLIST.has(word.toLowerCase()));
}

export function excerptAround(text: string, index: number, length: number, radius: number = EXCERPT_RADIUS): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function sourceTerms(primaryTerm: string, variants?: string[] | null): string[] {
  return [primaryTerm, ...(variants ?? [])];
}
