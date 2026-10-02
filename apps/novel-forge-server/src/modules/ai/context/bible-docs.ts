import { deriveBibleDocTitle } from '@server/common';
import { type Bible } from '@server/database/schemas';

export type BibleDocRow = Pick<Bible.Document, 'section' | 'slug' | 'frontmatter' | 'body'>;

const SECTION_PRIORITY: readonly Bible.Section[] = ['project', 'plot', 'world', 'power', 'lore', 'story_state', 'ai'];
const CORE_SECTIONS: ReadonlySet<Bible.Section> = new Set(['plot', 'world', 'power']);
const CORE_PROJECT_SLUGS: readonly string[] = ['premise', 'reader-promise'];

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
  return deriveBibleDocTitle(doc);
}

export function bibleDocExcerpt(doc: BibleDocRow, maxChars: number): string {
  const firstParagraph = plainText(doc.body ?? '').split(/\n\s*\n/, 1)[0] ?? '';
  return clipAtBoundary(firstParagraph, maxChars);
}

export const ORGANISED_TIMELINE_DOC = { section: 'project', slug: 'timeline' } as const satisfies Pick<BibleDocRow, 'section' | 'slug'>;
export const OPEN_QUESTIONS_DOC = { section: 'project', slug: 'open-questions' } as const satisfies Pick<BibleDocRow, 'section' | 'slug'>;

/**
 * Reserved addresses only planners read, whoever writes to them. The organised timeline and the open questions name what happens later in
 * the book and no scheduled canon fact backs them for the writer's scrub, so they stay out of the outliner's citable catalog, every writer
 * pack, brief refs, the voice step's cited pages and the lore index. The chat hub may look them up, and a turn that does holds for review
 * every change the chapter writer would read.
 */
const PLANNER_ONLY_DOCS: readonly Pick<BibleDocRow, 'section' | 'slug'>[] = [ORGANISED_TIMELINE_DOC, OPEN_QUESTIONS_DOC];

/**
 * Pages the outliner may still cite but the chapter writer never reads: they lay out every volume, later ones included, so a writer ref to
 * one resolves to nothing. `story_state/volumes` is the address the volume plan had before the manifest.
 */
const WRITER_EXCLUDED_DOCS: readonly Pick<BibleDocRow, 'section' | 'slug'>[] = [
  { section: 'story_state', slug: 'volume-plan' },
  { section: 'story_state', slug: 'volumes' },
  { section: 'plot', slug: 'escalation-map' },
];

function listed(pages: readonly Pick<BibleDocRow, 'section' | 'slug'>[], doc: Pick<BibleDocRow, 'section' | 'slug'>): boolean {
  return pages.some(page => page.section === doc.section && page.slug === doc.slug);
}

export function isPlannerOnlyBibleDoc(doc: Pick<BibleDocRow, 'section' | 'slug'>): boolean {
  return listed(PLANNER_ONLY_DOCS, doc);
}

export function isWriterExcludedBibleDoc(doc: Pick<BibleDocRow, 'section' | 'slug'>): boolean {
  return isPlannerOnlyBibleDoc(doc) || listed(WRITER_EXCLUDED_DOCS, doc);
}

/** Who reads the page, as the API reports it: derived from the reserved addresses here so no client keeps its own copy. */
export function bibleDocAccess(doc: Pick<BibleDocRow, 'section' | 'slug'>): { writerExcluded: boolean; plannerOnly: boolean } {
  return { writerExcluded: isWriterExcludedBibleDoc(doc), plannerOnly: isPlannerOnlyBibleDoc(doc) };
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
