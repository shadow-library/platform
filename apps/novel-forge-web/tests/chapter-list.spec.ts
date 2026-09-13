import { describe, expect, it } from 'bun:test';

import { buildChapterRows, type ChapterListBrief, type ChapterListDraft, chapterSummary, countChapterRows, filterChapterRows } from '../src/lib/chapter-list';

const drafts: ChapterListDraft[] = [
  { chapter: 3, title: 'Three', status: 'final', reviewStatus: 'final' },
  { chapter: 1, title: 'One', status: 'draft', reviewStatus: 'needs_review' },
  { chapter: 5, title: 'Unplanned', status: 'draft', reviewStatus: 'generating' },
];

const briefs: ChapterListBrief[] = [
  { chapter: 1, title: 'Brief one', writeMode: 'standard' },
  { chapter: 2, title: 'Brief two', writeMode: 'external' },
  { chapter: 3, title: 'Brief three', writeMode: 'standard' },
  { chapter: 4, title: null, writeMode: 'standard' },
];

describe('buildChapterRows', () => {
  it('should interleave written chapters and unwritten brief slots in chapter order', () => {
    const rows = buildChapterRows(drafts, briefs);
    expect(rows.map(r => [r.chapter, r.kind])).toEqual([
      [1, 'written'],
      [2, 'planned'],
      [3, 'written'],
      [4, 'planned'],
      [5, 'written'],
    ]);
  });

  it('should prefer the draft title over the brief title when a slot is written', () => {
    expect(buildChapterRows(drafts, briefs)[0]?.title).toBe('One');
  });

  it('should carry the brief write mode onto a planned slot', () => {
    const slot = buildChapterRows(drafts, briefs).find(r => r.chapter === 2);
    expect(slot).toEqual({ kind: 'planned', chapter: 2, title: 'Brief two', writeMode: 'external' });
  });
});

describe('countChapterRows', () => {
  it('should count every listed row under all, so all equals written plus not written', () => {
    const counts = countChapterRows(buildChapterRows(drafts, briefs));
    expect(counts).toEqual({ all: 5, not_written: 2, needs_review: 1, draft: 2, final: 1 });
  });

  it('should agree with the rows each filter shows', () => {
    const rows = buildChapterRows(drafts, briefs);
    const counts = countChapterRows(rows);
    for (const filter of ['all', 'not_written', 'needs_review', 'draft', 'final'] as const) {
      expect(filterChapterRows(rows, filter)).toHaveLength(counts[filter]);
    }
  });

  it('should count a contradiction as needing review', () => {
    const counts = countChapterRows(buildChapterRows([{ chapter: 1, status: 'draft', reviewStatus: 'contradiction' }], []));
    expect(counts.needs_review).toBe(1);
  });
});

describe('chapterSummary', () => {
  it('should report progress against the planned total when slots remain', () => {
    expect(chapterSummary({ all: 14, not_written: 13, needs_review: 0, draft: 1, final: 0 }, 1397)).toBe('1 of 14 chapters written · 1,397 words');
  });

  it('should drop the total once every listed chapter is written', () => {
    expect(chapterSummary({ all: 1, not_written: 0, needs_review: 0, draft: 1, final: 0 }, 1)).toBe('1 chapter written · 1 word');
  });

  it('should say nothing is planned when the list is empty', () => {
    expect(chapterSummary({ all: 0, not_written: 0, needs_review: 0, draft: 0, final: 0 }, 0)).toBe('No chapters planned or written yet');
  });
});
