import { describe, expect, it } from 'bun:test';

import {
  CHAPTER_PAGE_SIZE,
  type ChapterGroup,
  chaptersOnPage,
  chaptersSubtitle,
  chapterSummary,
  type ChapterVolume,
  clampGroupPages,
  currentPageOf,
  emptyVolumeNote,
  goalMetLabel,
  groupChaptersByVolume,
  groupPages,
  isChapterFilter,
  isChapterShow,
  jumpToChapter,
  listedChapters,
  nextBriefChapter,
  nextVolumeGroup,
  opensByDefault,
  pageOfChapter,
  pageRangeLabel,
  parseGroupPages,
  rowsWindow,
  rowVisible,
  showCounts,
  UNGROUPED_KEY,
  visibleChapters,
  volumeMeta,
  volumesStarted,
  volumeStateLabel,
} from '../src/lib/chapter-list';

function volume(overrides: Partial<ChapterVolume> & Pick<ChapterVolume, 'volumeKey' | 'ordinal'>): ChapterVolume {
  return { title: null, objective: null, state: 'not_started', planFirstChapter: null, planLastChapter: null, wordCount: 0, ...overrides };
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const TIDE: ChapterVolume[] = [
  volume({ volumeKey: 'v3', ordinal: 3, title: 'A new bargain' }),
  volume({ volumeKey: 'v1', ordinal: 1, title: 'The sea refuses', state: 'goal_met', planFirstChapter: 1, planLastChapter: 38, wordCount: 118200 }),
  volume({ volumeKey: 'v2', ordinal: 2, title: 'The payment', state: 'active', planFirstChapter: 39, planLastChapter: 86, wordCount: 153200 }),
];

describe('groupChaptersByVolume', () => {
  it('should order volumes by ordinal and number them from 1', () => {
    const groups = groupChaptersByVolume(TIDE, range(1, 86));
    expect(groups.map(group => [group.key, group.number])).toEqual([
      ['v1', 1],
      ['v2', 2],
      ['v3', 3],
    ]);
  });

  it('should place every chapter by its volume’s plan range, drafts and briefs included', () => {
    const [first, second, third] = groupChaptersByVolume(TIDE, range(1, 86));
    expect(first?.chapters).toEqual(range(1, 38));
    expect(second?.chapters).toEqual(range(39, 86));
    expect(third?.chapters).toEqual([]);
  });

  it('should put a chapter no volume claims past every range in the active volume', () => {
    expect(groupChaptersByVolume(TIDE, range(1, 88))[1]?.chapters.slice(-2)).toEqual([87, 88]);
  });

  it('should fall back to the last volume with chapters when none is active', () => {
    const volumes = TIDE.map(entry => (entry.state === 'active' ? { ...entry, state: 'goal_met' as const } : entry));
    expect(groupChaptersByVolume(volumes, range(1, 90))[1]?.chapters.at(-1)).toBe(90);
  });

  it('should give every unclaimed chapter to the active volume when no volume has a range', () => {
    const volumes = [volume({ volumeKey: 'a', ordinal: 0, state: 'active' }), volume({ volumeKey: 'b', ordinal: 1 })];
    expect(groupChaptersByVolume(volumes, [1, 2, 3]).map(group => group.chapters)).toEqual([[1, 2, 3], []]);
  });

  it('should keep a chapter in a gap between ranges with the volume before it', () => {
    const volumes = [
      volume({ volumeKey: 'a', ordinal: 1, state: 'goal_met', planFirstChapter: 1, planLastChapter: 10 }),
      volume({ volumeKey: 'b', ordinal: 2, state: 'active', planFirstChapter: 13, planLastChapter: 20 }),
    ];
    expect(groupChaptersByVolume(volumes, range(1, 20))[0]?.chapters).toEqual(range(1, 12));
  });

  it('should return one ungrouped list for a novel with no volumes', () => {
    expect(groupChaptersByVolume([], [3, 1, 2])).toEqual([{ key: UNGROUPED_KEY, chapters: [1, 2, 3] }]);
  });
});

describe('volume pages', () => {
  const [done, writing] = groupChaptersByVolume(TIDE, range(1, 86)) as [ChapterGroup, ChapterGroup, ChapterGroup];

  it('should open the volume being written on its newest page', () => {
    expect(currentPageOf(writing, undefined)).toBe(2);
    expect(chaptersOnPage(writing, 2)).toEqual(range(64, 86));
  });

  it('should open a finished volume at its start', () => {
    expect(currentPageOf(done, undefined)).toBe(1);
  });

  it('should honour a page from the URL and clamp one past the end', () => {
    expect(currentPageOf(writing, { v2: 1 })).toBe(1);
    expect(currentPageOf(writing, { v2: 9 })).toBe(2);
  });

  it('should hold 25 chapters to a page', () => {
    expect(chaptersOnPage(done, 1)).toHaveLength(CHAPTER_PAGE_SIZE);
  });

  it('should label each page by its chapter span', () => {
    expect(groupPages(writing)).toEqual([
      { page: 1, label: 'Ch 39–63' },
      { page: 2, label: 'Ch 64–86' },
    ]);
  });

  it('should describe the page shown', () => {
    expect(pageRangeLabel(writing, 2)).toBe('Page 2 of 2 · chapters 64–86 · 25 per page, newest page opens first');
    expect(pageRangeLabel(done, 1)).toBe('Page 1 of 2 · chapters 1–25 · 25 per page');
  });

  it('should list the chapters open groups show', () => {
    const visible = visibleChapters([done, writing], group => group.key === 'v2', undefined);
    expect(visible.has(86)).toBe(true);
    expect(visible.has(1)).toBe(false);
  });
});

describe('rowsWindow', () => {
  it('should cover the page’s stretch of the whole list', () => {
    expect(rowsWindow(range(1, 86), range(64, 86))).toEqual({ offset: 63, limit: 23 });
  });

  it('should count positions when the list has gaps', () => {
    expect(rowsWindow([1, 2, 5, 9, 12], [5, 9])).toEqual({ offset: 2, limit: 2 });
  });

  it('should clamp a slice that spans more than one request can hold', () => {
    expect(rowsWindow(range(1, 300), [1, 250])).toEqual({ offset: 0, limit: 100 });
  });

  it('should ask for nothing on an empty page or unknown chapter', () => {
    expect(rowsWindow(range(1, 5), [])).toBeUndefined();
    expect(rowsWindow(range(1, 5), [7])).toBeUndefined();
  });
});

describe('rowVisible', () => {
  const final = { kind: 'written' as const, chapter: 3, status: 'final' as const };
  const draft = { kind: 'written' as const, chapter: 4, status: 'draft' as const };
  const planned = { kind: 'planned' as const, chapter: 5 };

  it('should split final chapters from the rest', () => {
    expect([final, draft, planned].map(row => rowVisible(row, 'final'))).toEqual([true, false, false]);
    expect([final, draft, planned].map(row => rowVisible(row, 'not_final'))).toEqual([false, true, true]);
    expect([final, draft, planned].every(row => rowVisible(row, 'all'))).toBe(true);
  });

  it('should keep only point-of-view matches while one is set', () => {
    expect([final, draft].map(row => rowVisible(row, 'all', new Set([3])))).toEqual([true, false]);
  });
});

describe('showCounts', () => {
  it('should count everything not final as not final', () => {
    expect(showCounts({ all: 86, not_written: 1, needs_review: 1, draft: 2, final: 83 })).toEqual({ all: 86, not_final: 3, final: 83 });
  });
});

describe('isChapterShow', () => {
  it('should accept the three show options only', () => {
    expect(['all', 'not_final', 'final'].every(isChapterShow)).toBe(true);
    expect(isChapterShow('needs_review')).toBe(false);
  });
});

describe('volume copy', () => {
  const groups = groupChaptersByVolume(TIDE, range(1, 86));
  const [done, writing, next] = groups as [ChapterGroup, ChapterGroup, ChapterGroup];

  it('should label each state', () => {
    expect(['goal_met', 'active', 'not_started'].map(state => volumeStateLabel(state as ChapterVolume['state']))).toEqual(['Goal met', 'Active', 'Not started']);
  });

  it('should say the volume being written is still growing', () => {
    expect(volumeMeta(writing)).toBe('Chapters 39–86 so far · 153,200 words');
    expect(volumeMeta(done)).toBe('Chapters 1–38 · 118,200 words');
    expect(volumeMeta(next)).toBe('');
  });

  it('should count started volumes', () => {
    expect(volumesStarted(TIDE)).toBe('2 of 3 volumes started');
    expect(volumesStarted([])).toBe('');
  });

  it('should name the volume goal met starts', () => {
    expect(nextVolumeGroup(groups, 'v2')?.key).toBe('v3');
    expect(goalMetLabel(writing, next)).toBe('Volume 2’s goal is met — start volume 3');
    expect(goalMetLabel(next, undefined)).toBe('Volume 3’s goal is met');
  });

  it('should explain an empty volume by its state', () => {
    expect(emptyVolumeNote(next, groups)).toBe('No chapters yet — this volume starts when you move on from volume 2.');
    expect(emptyVolumeNote({ ...writing, chapters: [] }, groups)).toBe('No chapters yet — the next chapter you write starts this volume.');
  });

  it('should collapse only finished volumes by default', () => {
    expect([done, writing, next].map(opensByDefault)).toEqual([false, true, true]);
  });

  it('should add volumes and the lock to the subtitle', () => {
    expect(chaptersSubtitle({ all: 86, not_written: 0, needs_review: 1, draft: 2, final: 83 }, 271400, TIDE)).toBe(
      '86 chapters written · 271,400 words · 2 of 3 volumes started · final chapters are locked — only you can amend them',
    );
  });
});

describe('jumpToChapter', () => {
  const groups = groupChaptersByVolume(TIDE, range(1, 86));

  it('should land on the chapter’s volume and page', () => {
    expect(jumpToChapter(groups, '40', 87)).toEqual({ kind: 'found', chapter: 40, groupKey: 'v2', page: 1, message: 'Chapter 40 · volume 2 — highlighted below.' });
    expect(jumpToChapter(groups, ' 70 ', 87)).toMatchObject({ groupKey: 'v2', page: 2 });
  });

  it('should refuse a chapter the book does not have', () => {
    expect(jumpToChapter(groups, '120', 87)).toEqual({ kind: 'missing', message: 'There’s no chapter 120 yet. The book has chapters 1–86; 87 is next.' });
    expect(jumpToChapter(groups, 'abc', 87).kind).toBe('missing');
    expect(jumpToChapter(groups, '', 87).message).toBe('There’s no chapter — yet. The book has chapters 1–86; 87 is next.');
  });

  it('should drop the volume from the message when the novel has none', () => {
    expect(jumpToChapter(groupChaptersByVolume([], [1, 2]), '2', 3)).toMatchObject({ message: 'Chapter 2 — highlighted below.' });
  });
});

describe('clampGroupPages', () => {
  const groups = groupChaptersByVolume(TIDE, range(1, 86));

  it('should pull an overshooting page back to the volume’s last page', () => {
    expect(clampGroupPages(groups, { v1: 1, v2: 7 })).toEqual({ v1: 1, v2: 2 });
  });

  it('should leave pages in range alone', () => {
    expect(clampGroupPages(groups, { v2: 2 })).toBeUndefined();
    expect(clampGroupPages(groups, undefined)).toBeUndefined();
  });
});

describe('parseGroupPages', () => {
  it('should keep positive whole pages only', () => {
    expect(parseGroupPages({ v1: 2, v2: 0, v3: 'x', v4: 1.5 })).toEqual({ v1: 2 });
    expect(parseGroupPages('v1')).toBeUndefined();
    expect(parseGroupPages({})).toBeUndefined();
  });
});

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
