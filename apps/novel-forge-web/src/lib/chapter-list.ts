export type ChapterFilter = 'all' | 'not_written' | 'needs_review' | 'draft' | 'final';

export interface ChapterListDraft {
  chapter: number;
  title?: string | null;
  status: 'draft' | 'final';
  reviewStatus: 'generating' | 'needs_review' | 'contradiction' | 'approved' | 'final';
}

export interface ChapterListBrief {
  chapter: number;
  title?: string | null;
  writeMode: 'standard' | 'external';
}

export type ChapterRow<D extends ChapterListDraft = ChapterListDraft> =
  { kind: 'written'; chapter: number; title?: string | null; draft: D } | { kind: 'planned'; chapter: number; title?: string | null; writeMode: ChapterListBrief['writeMode'] };

export type ChapterCounts = Record<ChapterFilter, number>;

function needsReview(draft: ChapterListDraft): boolean {
  return draft.reviewStatus === 'needs_review' || draft.reviewStatus === 'contradiction';
}

function matchesFilter(row: ChapterRow, filter: ChapterFilter): boolean {
  if (filter === 'all') return true;
  if (row.kind === 'planned') return filter === 'not_written';
  if (filter === 'not_written') return false;
  if (filter === 'needs_review') return needsReview(row.draft);
  return row.draft.status === filter;
}

export function buildChapterRows<D extends ChapterListDraft>(drafts: readonly D[], briefs: readonly ChapterListBrief[]): ChapterRow<D>[] {
  const drafted = new Set(drafts.map(d => d.chapter));
  const written: ChapterRow<D>[] = drafts.map(draft => ({ kind: 'written', chapter: draft.chapter, title: draft.title, draft }));
  const planned: ChapterRow<D>[] = briefs.filter(b => !drafted.has(b.chapter)).map(b => ({ kind: 'planned', chapter: b.chapter, title: b.title, writeMode: b.writeMode }));
  return [...written, ...planned].sort((a, b) => a.chapter - b.chapter);
}

export function filterChapterRows<D extends ChapterListDraft>(rows: readonly ChapterRow<D>[], filter: ChapterFilter): ChapterRow<D>[] {
  return rows.filter(row => matchesFilter(row, filter));
}

export function countChapterRows(rows: readonly ChapterRow[]): ChapterCounts {
  const counts: ChapterCounts = { all: 0, not_written: 0, needs_review: 0, draft: 0, final: 0 };
  for (const row of rows) {
    for (const filter of Object.keys(counts) as ChapterFilter[]) {
      if (matchesFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
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
