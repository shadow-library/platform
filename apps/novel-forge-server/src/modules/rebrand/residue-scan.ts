/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { BANNED_REAL_WORLD_TERMS } from './banned-terms';

/**
 * Defining types
 */

/** The subset of a glossary row the pure scan functions need — callers pass DB rows or model output. */
export interface GlossaryLike {
  sourceName: string;
  variants?: string[] | null;
  replacement: string;
  category: string;
  notes?: string | null;
}

export interface ResidueIssue {
  source: 'residue';
  type: 'glossary_leftover' | 'cjk' | 'banned_term';
  detail: string;
  excerpt?: string;
}

/**
 * Declaring the constants
 */

// Terms shorter than this are too collision-prone to scan for ("Ye", "Li" are English-adjacent).
const MIN_TERM_LENGTH = 3;
const EXCERPT_RADIUS = 60;
const CJK_PATTERN = /[一-鿿㐀-䶿]/u;

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerptAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(body.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

function findTerm(body: string, term: string, caseSensitive: boolean): number {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, caseSensitive ? '' : 'i');
  const match = pattern.exec(body);
  return match?.index ?? -1;
}

function sourceTerms(entry: GlossaryLike): string[] {
  return [entry.sourceName, ...(entry.variants ?? [])];
}

/**
 * Deterministic post-conversion check (rebrand design §2): leftover glossary source names/variants
 * (case-sensitive — pinyin surnames like "Long" collide with English words in lowercase), CJK
 * characters, and banned real-world terms (case-insensitive). Free, so it runs on every chapter.
 */
export function scanResidue(body: string, glossary: GlossaryLike[], extraBanned: string[] = []): ResidueIssue[] {
  const issues: ResidueIssue[] = [];

  for (const entry of glossary) {
    if (entry.sourceName === entry.replacement) continue;
    for (const term of sourceTerms(entry)) {
      if (term.length < MIN_TERM_LENGTH) continue;
      const index = findTerm(body, term, true);
      if (index === -1) continue;
      issues.push({ source: 'residue', type: 'glossary_leftover', detail: `"${term}" should be "${entry.replacement}"`, excerpt: excerptAround(body, index, term.length) });
      break; // One issue per glossary entry is enough to trigger a repair.
    }
  }

  const cjk = CJK_PATTERN.exec(body);
  if (cjk?.index !== undefined) issues.push({ source: 'residue', type: 'cjk', detail: 'untranslated CJK characters remain', excerpt: excerptAround(body, cjk.index, 1) });

  for (const term of [...BANNED_REAL_WORLD_TERMS, ...extraBanned]) {
    if (term.length < MIN_TERM_LENGTH) continue;
    const index = findTerm(body, term, false);
    if (index === -1) continue;
    issues.push({ source: 'residue', type: 'banned_term', detail: `real-world term "${term}" must not appear`, excerpt: excerptAround(body, index, term.length) });
  }

  return issues;
}

/**
 * Selects the glossary entries a chapter conversion needs (rebrand design §2): every `country` and
 * `culture` entry (the bounded world map, always first so budget truncation never drops it), then
 * entries whose source name, variant, or replacement appears in the text — replacements matter
 * because repair and audit passes scan converted prose. Matched entries sort by occurrence count so
 * truncation drops the rarest names first.
 */
export function selectGlossarySlice(chapterText: string, entries: GlossaryLike[]): GlossaryLike[] {
  const haystack = chapterText.toLowerCase();
  const worldMap: GlossaryLike[] = [];
  const matched: { entry: GlossaryLike; count: number }[] = [];

  for (const entry of entries) {
    if (entry.category === 'country' || entry.category === 'culture') {
      worldMap.push(entry);
      continue;
    }
    let count = 0;
    for (const term of [...sourceTerms(entry), entry.replacement]) {
      if (term.length < MIN_TERM_LENGTH) continue;
      let cursor = haystack.indexOf(term.toLowerCase());
      while (cursor !== -1) {
        count++;
        cursor = haystack.indexOf(term.toLowerCase(), cursor + term.length);
      }
    }
    if (count > 0) matched.push({ entry, count });
  }

  matched.sort((a, b) => b.count - a.count);
  return [...worldMap, ...matched.map(m => m.entry)];
}

/** One line per mapping — the rendering the convert and audit prompts consume. */
export function renderGlossarySlice(entries: GlossaryLike[]): string {
  if (entries.length === 0) return 'No mappings yet — every proper noun you rename goes in discoveredNames.';
  return entries
    .map(e => {
      const variants = (e.variants ?? []).length > 0 ? ` (also: ${(e.variants ?? []).join(', ')})` : '';
      return `${e.sourceName}${variants} → ${e.replacement} [${e.category}]${e.notes ? ` — ${e.notes}` : ''}`;
    })
    .join('\n');
}
