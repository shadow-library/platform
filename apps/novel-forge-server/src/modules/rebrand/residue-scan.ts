import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { DEFAULT_TERM_PACKS, resolveBannedTerms } from './banned-terms';

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

// Terms shorter than this are too collision-prone to scan for ("Ye", "Li" are English-adjacent).
const MIN_TERM_LENGTH = 3;
const EXCERPT_RADIUS = 60;
const CJK_PATTERN = /[一-鿿㐀-䶿]/u;

// Single-word glossary terms that collide with ordinary English words ("Long", "Han") stay
// case-sensitive so a lowercase sentence doesn't false-positive; everything else — multi-word
// names, CJK, and single words that aren't in this list — scans case-insensitively, because the
// real failure mode is a leftover like "the huaxia banner" that a strict-case scan never catches.
const COMMON_WORD_ALLOWLIST = new Set([
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

const logger = Logger.getLogger(APP_NAME, 'residue-scan');

export const GLOSSARY_SLICE_CAP = 120;

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function excerptAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(body.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

function isCaseInsensitiveTerm(term: string): boolean {
  return !term.split(/\s+/).some(word => COMMON_WORD_ALLOWLIST.has(word.toLowerCase()));
}

function findTerm(body: string, term: string, caseSensitive: boolean): number {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, caseSensitive ? '' : 'i');
  const match = pattern.exec(body);
  return match?.index ?? -1;
}

function countTerm(body: string, term: string, caseSensitive: boolean): number {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, caseSensitive ? 'g' : 'gi');
  return (body.match(pattern) ?? []).length;
}

function sourceTerms(entry: GlossaryLike): string[] {
  return [entry.sourceName, ...(entry.variants ?? [])];
}

/**
 * Deterministic post-conversion check (rebrand design §2): leftover glossary source names/variants
 * (case-insensitive unless the term collides with a common English word — see
 * `isCaseInsensitiveTerm` — so lowercase leftovers like "the huaxia banner" are still caught), CJK
 * characters, and banned real-world terms (case-insensitive, drawn from the selected term packs).
 * Free, so it runs on every chapter.
 */
export function scanResidue(body: string, glossary: GlossaryLike[], extraBanned: string[] = [], termPacks: string[] = DEFAULT_TERM_PACKS): ResidueIssue[] {
  const issues: ResidueIssue[] = [];

  for (const entry of glossary) {
    if (entry.sourceName === entry.replacement) continue;
    for (const term of sourceTerms(entry)) {
      if (term.length < MIN_TERM_LENGTH) continue;
      const index = findTerm(body, term, !isCaseInsensitiveTerm(term));
      if (index === -1) continue;
      issues.push({ source: 'residue', type: 'glossary_leftover', detail: `"${term}" should be "${entry.replacement}"`, excerpt: excerptAround(body, index, term.length) });
      break; // One issue per glossary entry is enough to trigger a repair.
    }
  }

  const cjk = CJK_PATTERN.exec(body);
  if (cjk?.index !== undefined) issues.push({ source: 'residue', type: 'cjk', detail: 'untranslated CJK characters remain', excerpt: excerptAround(body, cjk.index, 1) });

  const banned = [...resolveBannedTerms(termPacks), ...extraBanned];
  for (const term of banned) {
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
 * the render order favors the most relevant names. Matching uses the same word-boundary + case rules
 * as `scanResidue`, so a slice never disagrees with the scan that follows it.
 *
 * World-map entries are never dropped for the cap — the bounded world map is what makes the slice
 * safe to truncate at all. Matched entries are sorted by occurrence and kept highest-first; only if
 * the matched list alone would push the slice past `cap` do the rarest (lowest-occurrence) matches
 * fall off the end, and that drop is logged rather than silent. In practice a glossary rarely gets
 * anywhere near `cap` matches in one chapter, so this is a safety valve, not the common path.
 */
export function selectGlossarySlice(chapterText: string, entries: GlossaryLike[], cap: number = GLOSSARY_SLICE_CAP): GlossaryLike[] {
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
      count += countTerm(chapterText, term, !isCaseInsensitiveTerm(term));
    }
    if (count > 0) matched.push({ entry, count });
  }

  matched.sort((a, b) => b.count - a.count);
  const budget = Math.max(0, cap - worldMap.length);
  const kept = matched.slice(0, budget);
  const dropped = matched.length - kept.length;
  if (dropped > 0) logger.warn('glossary slice capped — dropping lowest-occurrence matches', { cap, worldMap: worldMap.length, matched: matched.length, dropped });

  return [...worldMap, ...kept.map(m => m.entry)];
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
