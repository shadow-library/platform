import { describe, expect, it } from 'bun:test';

import { buildChapterRows, CHAPTER_FILTERS, chapterNumbersMatchingPov, type ChapterRowBrief, type ChapterRowDraft, pageChapterRows, summarizeChapterRows } from '@server/common';

function draft(chapter: number, overrides: Partial<ChapterRowDraft> = {}): ChapterRowDraft {
  return {
    chapter,
    title: `Draft ${chapter}`,
    status: 'draft',
    reviewStatus: 'approved',
    generator: 'standard',
    isolated: false,
    finalizeBlocked: false,
    revision: 0,
    approvedRevision: null,
    wordCount: 100,
    judgeNote: null,
    ...overrides,
  };
}

function brief(chapter: number, overrides: Partial<ChapterRowBrief> = {}): ChapterRowBrief {
  return { chapter, title: `Brief ${chapter}`, writeMode: 'standard', pov: null, scenes: null, ...overrides };
}

const drafts: ChapterRowDraft[] = [
  draft(3, { title: 'Three', status: 'final', reviewStatus: 'final', wordCount: 300 }),
  draft(1, { title: 'One', reviewStatus: 'needs_review', wordCount: 1000 }),
  draft(5, { title: 'Unplanned', reviewStatus: 'generating', wordCount: 0 }),
];

const briefs: ChapterRowBrief[] = [
  brief(1, { title: 'Brief one' }),
  brief(2, { title: 'Brief two', writeMode: 'external' }),
  brief(3, { title: 'Brief three' }),
  brief(4, { title: null }),
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
    expect(buildChapterRows(drafts, briefs).find(r => r.chapter === 2)).toEqual({ kind: 'planned', chapter: 2, title: 'Brief two', writeMode: 'external', pov: null });
  });

  it('should leave the write mode null on a written chapter with no brief', () => {
    expect(buildChapterRows(drafts, briefs).find(r => r.chapter === 5)?.writeMode).toBeNull();
  });

  it('should carry the draft revision onto a written row', () => {
    const rows = buildChapterRows([draft(1, { revision: 3 })], []);
    expect(rows[0]).toMatchObject({ revision: 3 });
  });

  it('should resolve pov from the brief onto both written and planned rows', () => {
    const rows = buildChapterRows([draft(1)], [brief(1, { pov: 'mara' }), brief(2, { pov: 'ren' })]);
    expect(rows.find(r => r.chapter === 1)?.pov).toBe('mara');
    expect(rows.find(r => r.chapter === 2)?.pov).toBe('ren');
  });

  it('should pool a scene pov onto a row when the brief itself names none', () => {
    const rows = buildChapterRows([], [brief(1, { pov: null, scenes: [{ summary: 'x', pov: 'lio' }] })]);
    expect(rows[0]?.pov).toBe('lio');
  });

  it('should leave pov null on a written chapter with no brief', () => {
    expect(buildChapterRows(drafts, briefs).find(r => r.chapter === 5)?.pov).toBeNull();
  });
});

describe('chapterNumbersMatchingPov', () => {
  it('should match a brief pov and a pooled scene pov alike', () => {
    const numbers = chapterNumbersMatchingPov([brief(1, { pov: 'mara' }), brief(2, { pov: 'ren', scenes: [{ summary: 'x', pov: 'mara' }] }), brief(3, { pov: 'ren' })], 'mara');
    expect([...numbers].sort()).toEqual([1, 2]);
  });

  it('should return an empty set when no brief names the pov', () => {
    expect(chapterNumbersMatchingPov([brief(1, { pov: 'ren' })], 'mara').size).toBe(0);
  });
});

describe('summarizeChapterRows', () => {
  const overview = summarizeChapterRows(buildChapterRows(drafts, briefs));

  it('should count every listed row under all, so all equals written plus not written', () => {
    expect(overview.counts).toEqual({ all: 5, not_written: 2, needs_review: 1, draft: 2, final: 1 });
  });

  it('should agree with the rows each filter pages through', () => {
    const rows = buildChapterRows(drafts, briefs);
    for (const filter of CHAPTER_FILTERS) expect(pageChapterRows(rows, filter, 100, 0).total).toBe(overview.counts[filter]);
  });

  it('should total the words of written chapters only', () => {
    expect(overview.totalWords).toBe(1300);
  });

  it('should target the lowest unwritten brief next', () => {
    expect(overview.nextBriefChapter).toBe(2);
  });

  it('should report no next brief once every brief is written', () => {
    expect(summarizeChapterRows(buildChapterRows([draft(1)], [brief(1, { title: null })])).nextBriefChapter).toBeNull();
  });

  it('should place the frontier at the highest finalized chapter', () => {
    expect(overview.frontier).toBe(3);
  });

  it('should list every planned or written chapter number with the highest as the last', () => {
    expect(overview.chapters).toEqual([1, 2, 3, 4, 5]);
    expect(overview.lastChapter).toBe(5);
  });

  it('should report zeros and no contradiction for an empty novel', () => {
    expect(summarizeChapterRows([])).toEqual({
      counts: { all: 0, not_written: 0, needs_review: 0, draft: 0, final: 0 },
      totalWords: 0,
      nextBriefChapter: null,
      lastChapter: 0,
      frontier: 0,
      chapters: [],
      contradiction: null,
    });
  });

  it('should surface the lowest contradiction with the number flagged', () => {
    const rows = buildChapterRows([draft(7, { reviewStatus: 'contradiction', judgeNote: 'Later' }), draft(4, { reviewStatus: 'contradiction', judgeNote: 'Earlier' })], []);
    expect(summarizeChapterRows(rows).contradiction).toEqual({ chapter: 4, judgeNote: 'Earlier', count: 2 });
  });

  it('should count a contradiction as needing review', () => {
    expect(summarizeChapterRows(buildChapterRows([draft(1, { reviewStatus: 'contradiction' })], [])).counts.needs_review).toBe(1);
  });
});

describe('pageChapterRows', () => {
  const many = buildChapterRows(
    Array.from({ length: 30 }, (_, i) => draft(i + 1, { status: i % 2 === 0 ? 'final' : 'draft' })),
    [],
  );

  it('should return the requested window with the total of the whole filter', () => {
    const page = pageChapterRows(many, 'all', 10, 20);
    expect(page.total).toBe(30);
    expect(page.items.map(r => r.chapter)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it('should filter before paging so a page never comes back short of matches', () => {
    const page = pageChapterRows(many, 'final', 5, 0);
    expect(page.total).toBe(15);
    expect(page.items.map(r => r.chapter)).toEqual([1, 3, 5, 7, 9]);
  });

  it('should return no items past the end', () => {
    expect(pageChapterRows(many, 'all', 25, 50)).toEqual({ total: 30, items: [] });
  });
});
