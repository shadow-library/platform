export interface MatchSpec {
  all?: string[];
  any?: string[];
}

export function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word match that tolerates a plural `s`/`es`; `a|b` lists alternatives, so one `all` entry can accept several spellings. */
function hasTerm(normalised: string, term: string): boolean {
  const alternatives = term
    .split('|')
    .map(alternative => escapeRegExp(normalise(alternative)))
    .filter(Boolean);
  if (alternatives.length === 0) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${alternatives.join('|')})(s|es)?($|[^\\p{L}\\p{N}])`, 'u').test(normalised);
}

/** A spec with neither list never matches: an empty gold entry must fail loudly rather than pass everything. */
export function matches(text: string, spec: MatchSpec): boolean {
  const all = spec.all ?? [];
  const any = spec.any ?? [];
  if (all.length === 0 && any.length === 0) return false;
  const normalised = normalise(text);
  return all.every(term => hasTerm(normalised, term)) && (any.length === 0 || any.some(term => hasTerm(normalised, term)));
}

export function patternHits(text: string, patterns: readonly string[]): string[] {
  const normalised = normalise(text);
  return patterns.flatMap(pattern => {
    const found = new RegExp(pattern, 'iu').exec(normalised);
    return found ? [found[0]] : [];
  });
}

function words(text: string): string[] {
  return normalise(text)
    .replace(/[^\p{L}\p{N}' -]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function shingles(text: string, size: number): Set<string> {
  const tokens = words(text);
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index += 1) result.add(tokens.slice(index, index + size).join(' '));
  return result;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

/** Every string anywhere inside a JSON value, so an op or record can be searched without knowing its shape. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn);
  return [];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Prose with `system` panels and GFM tables removed: the chapter Markdown contract counts only prose towards length targets. */
export function proseOnly(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fence = FENCE.exec(line);
    if (fence?.[2] === 'system') {
      const marker = fence[1] ?? '```';
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(marker)) index += 1;
      continue;
    }
    const next = lines[index + 1] ?? '';
    if (line.includes('|') && next.includes('|') && TABLE_DELIMITER.test(next)) {
      index += 1;
      while (index + 1 < lines.length && (lines[index + 1] ?? '').trim() !== '' && (lines[index + 1] ?? '').includes('|')) index += 1;
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

export function proseWordCount(markdown: string): number {
  return wordCount(proseOnly(markdown));
}

export function lastWords(text: string, count: number): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.slice(-count).join(' ');
}
