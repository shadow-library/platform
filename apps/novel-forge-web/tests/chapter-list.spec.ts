import { describe, expect, it } from 'bun:test';

import { CHAPTER_PAGE_SIZE, chapterSummary, isChapterFilter, listedChapters, nextBriefChapter, pageOfChapter } from '../src/lib/chapter-list';

describe('pageOfChapter', () => {
  const chapters = Array.from({ length: 60 }, (_, i) => i + 1);

  it('should place the first page-worth of chapters on page 1', () => {
    expect(pageOfChapter(chapters, 1)).toBe(1);
    expect(pageOfChapter(chapters, CHAPTER_PAGE_SIZE)).toBe(1);
  });

  it('should move to the next page one chapter past a full page', () => {
    expect(pageOfChapter(chapters, CHAPTER_PAGE_SIZE + 1)).toBe(2);
  });

  it('should count positions rather than chapter numbers when the plan has gaps', () => {
    const gapped = [1, 2, 100, ...Array.from({ length: 30 }, (_, i) => 200 + i)];
    expect(pageOfChapter(gapped, 222)).toBe(2);
  });

  it('should fall back to page 1 for a chapter not in the list', () => {
    expect(pageOfChapter(chapters, 999)).toBe(1);
  });
});

describe('listedChapters', () => {
  it('should merge brief and draft chapters once each in ascending order', () => {
    expect(listedChapters([{ chapter: 3 }, { chapter: 1 }, { chapter: 2 }], [{ chapter: 5 }, { chapter: 1 }])).toEqual([1, 2, 3, 5]);
  });
});

describe('nextBriefChapter', () => {
  it('should pick the lowest brief without a draft', () => {
    expect(nextBriefChapter([{ chapter: 3 }, { chapter: 1 }, { chapter: 2 }], [{ chapter: 1 }])).toBe(2);
  });

  it('should ignore drafts that have no brief', () => {
    expect(nextBriefChapter([{ chapter: 1 }], [{ chapter: 1 }, { chapter: 2 }])).toBeUndefined();
  });
});

describe('isChapterFilter', () => {
  it('should accept every list filter', () => {
    for (const filter of ['all', 'not_written', 'needs_review', 'draft', 'final']) expect(isChapterFilter(filter)).toBe(true);
  });

  it('should reject anything else from the URL', () => {
    expect(isChapterFilter('drafts')).toBe(false);
    expect(isChapterFilter(undefined)).toBe(false);
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
