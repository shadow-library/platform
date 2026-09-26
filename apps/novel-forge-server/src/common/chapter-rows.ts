import { type Generation, type Project } from '@server/database';

import { briefMatchesPov, type ChapterPovBrief, resolveChapterPov } from './chapter-pov';

export const CHAPTER_FILTERS = ['all', 'not_written', 'needs_review', 'draft', 'final'] as const;

export type ChapterFilter = (typeof CHAPTER_FILTERS)[number];

export type ChapterFilterCounts = Record<ChapterFilter, number>;

export interface WrittenChapterRow {
  kind: 'written';
  chapter: number;
  title: string | null;
  writeMode: Generation.BriefWriteMode | null;
  pov: string | null;
  status: Generation.DraftStatus;
  reviewStatus: Generation.DraftReviewStatus;
  generator: Project.ContentGenerator;
  isolated: boolean;
  finalizeBlocked: boolean;
  revision: number;
  approvedRevision: number | null;
  wordCount: number;
  judgeNote: string | null;
}

export interface PlannedChapterRow {
  kind: 'planned';
  chapter: number;
  title: string | null;
  writeMode: Generation.BriefWriteMode;
  pov: string | null;
}

export type ChapterRow = WrittenChapterRow | PlannedChapterRow;

export interface ChapterContradiction {
  chapter: number;
  judgeNote: string | null;
  count: number;
}

export interface ChapterRowsOverview {
  counts: ChapterFilterCounts;
  totalWords: number;
  nextBriefChapter: number | null;
  lastChapter: number;
  frontier: number;
  chapters: number[];
  contradiction: ChapterContradiction | null;
}

export interface ChapterRowsPage {
  total: number;
  items: ChapterRow[];
}

export type ChapterRowDraft = Omit<WrittenChapterRow, 'kind' | 'writeMode' | 'pov'>;

export interface ChapterRowBrief extends ChapterPovBrief {
  chapter: number;
  title: string | null;
  writeMode: Generation.BriefWriteMode;
}

export function buildChapterRows(drafts: readonly ChapterRowDraft[], briefs: readonly ChapterRowBrief[]): ChapterRow[] {
  const briefByChapter = new Map(briefs.map(brief => [brief.chapter, brief]));
  const drafted = new Set(drafts.map(draft => draft.chapter));
  const written: ChapterRow[] = drafts.map(draft => {
    const brief = briefByChapter.get(draft.chapter);
    return { kind: 'written', ...draft, writeMode: brief?.writeMode ?? null, pov: resolveChapterPov(brief) };
  });
  const planned: ChapterRow[] = briefs
    .filter(brief => !drafted.has(brief.chapter))
    .map(brief => ({ kind: 'planned', chapter: brief.chapter, title: brief.title, writeMode: brief.writeMode, pov: resolveChapterPov(brief) }));
  return [...written, ...planned].sort((a, b) => a.chapter - b.chapter);
}

export function matchesChapterFilter(row: ChapterRow, filter: ChapterFilter): boolean {
  if (filter === 'all') return true;
  if (row.kind === 'planned') return filter === 'not_written';
  if (filter === 'not_written') return false;
  if (filter === 'needs_review') return row.reviewStatus === 'needs_review' || row.reviewStatus === 'contradiction';
  return row.status === filter;
}

export function summarizeChapterRows(rows: readonly ChapterRow[]): ChapterRowsOverview {
  const sorted = [...rows].sort((a, b) => a.chapter - b.chapter);
  const counts = Object.fromEntries(CHAPTER_FILTERS.map(filter => [filter, sorted.filter(row => matchesChapterFilter(row, filter)).length])) as ChapterFilterCounts;
  const written = sorted.filter((row): row is WrittenChapterRow => row.kind === 'written');
  const contradicted = written.filter(row => row.reviewStatus === 'contradiction');
  const [firstContradiction] = contradicted;

  return {
    counts,
    totalWords: written.reduce((sum, row) => sum + row.wordCount, 0),
    nextBriefChapter: sorted.find(row => row.kind === 'planned')?.chapter ?? null,
    lastChapter: Math.max(0, ...sorted.map(row => row.chapter)),
    frontier: Math.max(0, ...written.filter(row => row.status === 'final').map(row => row.chapter)),
    chapters: sorted.map(row => row.chapter),
    contradiction: firstContradiction ? { chapter: firstContradiction.chapter, judgeNote: firstContradiction.judgeNote, count: contradicted.length } : null,
  };
}

/** Chapter numbers whose brief counts as this point of view — its own pov, or any pooled scene pov. Covers drafted and planned briefs alike. */
export function chapterNumbersMatchingPov(briefs: readonly ChapterRowBrief[], pov: string): Set<number> {
  return new Set(briefs.filter(brief => briefMatchesPov(brief, pov)).map(brief => brief.chapter));
}

export function pageChapterRows(rows: readonly ChapterRow[], filter: ChapterFilter, limit: number, offset: number): ChapterRowsPage {
  const matching = rows.filter(row => matchesChapterFilter(row, filter)).sort((a, b) => a.chapter - b.chapter);
  return { total: matching.length, items: matching.slice(offset, offset + limit) };
}
