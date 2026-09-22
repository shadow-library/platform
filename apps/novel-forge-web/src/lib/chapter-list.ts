import { type ChapterRowCountsResponse, type ChapterRowFilter } from '@/lib/apis';

export type ChapterFilter = ChapterRowFilter;

export type ChapterCounts = ChapterRowCountsResponse;

export const CHAPTER_PAGE_SIZE = 25;

const CHAPTER_FILTERS: readonly ChapterFilter[] = ['all', 'not_written', 'needs_review', 'draft', 'final'];

export function isChapterFilter(value: unknown): value is ChapterFilter {
  return CHAPTER_FILTERS.includes(value as ChapterFilter);
}

/** The page of the unfiltered list that holds `chapter`, given every planned or written chapter number in order. */
export function pageOfChapter(chapters: readonly number[], chapter: number): number {
  const index = [...chapters].sort((a, b) => a - b).indexOf(chapter);
  return index < 0 ? 1 : Math.floor(index / CHAPTER_PAGE_SIZE) + 1;
}

interface ChapterNumbered {
  chapter: number;
}

/** Every planned or written chapter number, ascending — the order the unfiltered list pages through. */
export function listedChapters(briefs: readonly ChapterNumbered[], drafts: readonly ChapterNumbered[]): number[] {
  return [...new Set([...briefs, ...drafts].map(item => item.chapter))].sort((a, b) => a - b);
}

/** The lowest brief with no draft yet — the only chapter `generate` will write next. */
export function nextBriefChapter(briefs: readonly ChapterNumbered[], drafts: readonly ChapterNumbered[]): number | undefined {
  const drafted = new Set(drafts.map(draft => draft.chapter));
  return listedChapters(briefs, []).find(chapter => !drafted.has(chapter));
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

export function chapterSummary(counts: ChapterCounts, totalWords: number): string {
  if (counts.all === 0) return 'No chapters planned or written yet';
  const written = counts.all - counts.not_written;
  const progress = counts.not_written === 0 ? `${plural(written, 'chapter')} written` : `${written.toLocaleString()} of ${plural(counts.all, 'chapter')} written`;
  return `${progress} · ${plural(totalWords, 'word')}`;
}
