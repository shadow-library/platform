import { type Bible } from '@server/database/schemas';

import { countTokens } from './token-budget';

export type BibleDocRow = Pick<Bible.Document, 'section' | 'slug' | 'frontmatter' | 'body'>;

export interface BibleDigestOptions {
  totalTokens: number;
  perDocTokens: number;
  /** Only premise, reader promise and the plot, world and power sections; every other document is left out. */
  coreOnly?: boolean;
}

export interface BibleDigest {
  text: string;
  truncated: string[];
  omitted: string[];
}

const SECTION_PRIORITY: readonly Bible.Section[] = ['project', 'plot', 'world', 'power', 'lore', 'story_state', 'ai'];
const CORE_SECTIONS: ReadonlySet<Bible.Section> = new Set(['plot', 'world', 'power']);
const CORE_PROJECT_SLUGS: readonly string[] = ['premise', 'reader-promise'];
// A document cut below this is a heading and a sentence; the planner is better served by fewer documents it can actually read.
const MIN_DOC_TOKENS = 400;
const BLOCK_OVERHEAD_TOKENS = 10;
const CUT_MARKER = '\n[…cut to fit]';

// Unspaced scripts have no word boundary to cut at, only clause marks.
const CLAUSE_BREAKS = '，、；：';
const SENTENCE_END = /[.!?]["'”’)\]]?(?=\s|$)|[。！？]["'”’）」』]?/g;

/** Cuts at the last sentence end in the back half of the window, else at the last word or clause boundary — never mid-word. */
export function clipAtBoundary(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;

  const window = flat.slice(0, maxChars + 1);
  let sentenceEnd = -1;
  for (const match of window.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (end <= maxChars) sentenceEnd = end;
  }
  if (sentenceEnd >= maxChars / 2) return flat.slice(0, sentenceEnd);

  const wordBreak = Math.max(window.lastIndexOf(' '), ...[...CLAUSE_BREAKS].map(mark => window.lastIndexOf(mark)));
  if (wordBreak > 0) return `${flat.slice(0, wordBreak).replace(/[\s,;:—–-]+$/, '')}…`;
  if (sentenceEnd > 0) return flat.slice(0, sentenceEnd);
  return `${flat.slice(0, maxChars)}…`;
}

/** The prose of a markdown body with headings, list markers, emphasis and link targets removed. */
export function plainText(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !/^\s*#{1,6}\s/.test(line))
    .map(line => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, ''))
    .join('\n')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|`)/g, '')
    .trim();
}

export function hasBibleContent(doc: Pick<BibleDocRow, 'body'>): boolean {
  return (doc.body ?? '').trim() !== '';
}

export function bibleDocRef(doc: Pick<BibleDocRow, 'section' | 'slug'>): string {
  return `bible_doc:${doc.section}/${doc.slug}`;
}

export function bibleDocLabel(doc: BibleDocRow): string {
  const title = doc.frontmatter?.['title'];
  if (typeof title === 'string' && title.trim() !== '') return title.trim();
  const heading = /^#\s+(.+)$/m.exec(doc.body ?? '')?.[1]?.trim();
  if (heading) return heading;
  const words = doc.slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function bibleDocExcerpt(doc: BibleDocRow, maxChars: number): string {
  const firstParagraph = plainText(doc.body ?? '').split(/\n\s*\n/, 1)[0] ?? '';
  return clipAtBoundary(firstParagraph, maxChars);
}

export function isCoreBibleDoc(doc: Pick<BibleDocRow, 'section' | 'slug'>): boolean {
  return CORE_SECTIONS.has(doc.section) || (doc.section === 'project' && CORE_PROJECT_SLUGS.includes(doc.slug));
}

function docRank(doc: Pick<BibleDocRow, 'section' | 'slug'>): [number, number, number] {
  const projectSlug = CORE_PROJECT_SLUGS.indexOf(doc.slug);
  return [isCoreBibleDoc(doc) ? 0 : 1, SECTION_PRIORITY.indexOf(doc.section), doc.section === 'project' && projectSlug !== -1 ? projectSlug : CORE_PROJECT_SLUGS.length];
}

/** Premise and reader promise, then plot, world and power, then everything else; slug order within a section. */
export function rankBibleDocs<T extends Pick<BibleDocRow, 'section' | 'slug'>>(docs: readonly T[]): T[] {
  return [...docs].sort((left, right) => {
    const [a, b] = [docRank(left), docRank(right)];
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || left.slug.localeCompare(right.slug);
  });
}

/**
 * Whole paragraphs first; the paragraph that overflows is cut at its last sentence that fits, else its last word, so a document with
 * long paragraphs still fills its allotment instead of stopping at the first paragraph that does not fit whole.
 */
export function cutToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (countTokens(text) <= maxTokens) return { text, truncated: false };
  const kept: string[] = [];
  let used = 0;
  for (const paragraph of text.split(/\n\n+/)) {
    const cost = countTokens(paragraph) + (kept.length > 0 ? 1 : 0);
    if (used + cost <= maxTokens) {
      kept.push(paragraph);
      used += cost;
      continue;
    }
    const partial = cutParagraph(paragraph, maxTokens - used - (kept.length > 0 ? 1 : 0));
    if (partial) kept.push(partial);
    break;
  }
  return { text: kept.join('\n\n'), truncated: true };
}

function cutParagraph(paragraph: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const words = paragraph.split(/(?<=[\s。！？，、；：])/);
  let low = 0;
  let high = words.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (countTokens(words.slice(0, mid).join('')) <= maxTokens) low = mid;
    else high = mid - 1;
  }
  const fitted = words.slice(0, low).join('').trimEnd();
  const sentenceEnds = [...fitted.matchAll(SENTENCE_END)].map(match => match.index + match[0].length);
  const lastSentence = sentenceEnds.at(-1) ?? 0;
  return lastSentence >= fitted.length / 2 ? fitted.slice(0, lastSentence) : fitted;
}

function docHeading(doc: BibleDocRow): string {
  return `### ${bibleDocRef(doc)} — ${bibleDocLabel(doc)}`;
}

/** Gives every document an equal share, handing what a short one leaves unused to the longer ones. */
function waterFill(sizes: number[], total: number, cap: number): number[] {
  const allotted = sizes.map(() => 0);
  const bySize = sizes.map((_, index) => index).sort((a, b) => (sizes[a] ?? 0) - (sizes[b] ?? 0));
  let remaining = total;
  bySize.forEach((index, position) => {
    const share = Math.floor(remaining / (bySize.length - position));
    const allot = Math.max(0, Math.min(sizes[index] ?? 0, cap, share));
    allotted[index] = allot;
    remaining -= allot;
  });
  return allotted;
}

/**
 * Core documents are sized first and the rest share what they leave. A tier keeps only as many documents as can each get a
 * readable share, in rank order, so an oversized bible loses its lowest-priority documents rather than shrinking every one.
 */
export function renderBibleDigest(docs: readonly BibleDocRow[], options: BibleDigestOptions): BibleDigest {
  const ranked = rankBibleDocs(docs.filter(hasBibleContent));
  const tiers = [ranked.filter(isCoreBibleDoc), options.coreOnly ? [] : ranked.filter(doc => !isCoreBibleDoc(doc))];

  const blocks = new Map<BibleDocRow, string>();
  const truncated: string[] = [];
  const omitted: string[] = [];
  let remaining = options.totalTokens;

  for (const tier of tiers) {
    const kept: BibleDocRow[] = [];
    let headingTokens = 0;
    for (const doc of tier) {
      const cost = countTokens(docHeading(doc)) + BLOCK_OVERHEAD_TOKENS;
      if (remaining - headingTokens - cost < (kept.length + 1) * MIN_DOC_TOKENS) break;
      kept.push(doc);
      headingTokens += cost;
    }
    omitted.push(...tier.slice(kept.length).map(bibleDocRef));

    const sizes = kept.map(doc => countTokens(doc.body ?? ''));
    const allotted = waterFill(sizes, remaining - headingTokens, options.perDocTokens);
    kept.forEach((doc, index) => {
      const cut = cutToTokens(doc.body ?? '', allotted[index] ?? 0);
      if (cut.truncated) truncated.push(bibleDocRef(doc));
      const block = `${docHeading(doc)}\n${cut.text}${cut.truncated ? CUT_MARKER : ''}`;
      blocks.set(doc, block);
      remaining -= countTokens(block) + 2;
    });
  }

  const text = ranked
    .map(doc => blocks.get(doc))
    .filter((block): block is string => block !== undefined)
    .join('\n\n');
  return { text, truncated, omitted };
}
