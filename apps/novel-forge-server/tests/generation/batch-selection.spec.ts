import { describe, expect, it } from 'bun:test';

import { type BatchBrief, declaredDraftFields, selectGenerationBatch, toContentRating } from '@server/common';

const standard = (chapter: number): BatchBrief => ({ chapter, writeMode: 'standard' });
const external = (chapter: number): BatchBrief => ({ chapter, writeMode: 'external' });

describe('selectGenerationBatch', () => {
  it('should take the next undrafted chapters in ascending order when no slot is external', () => {
    const briefs = [standard(1), standard(2), standard(3), standard(4)];
    expect(selectGenerationBatch(briefs, new Set([1]), new Set([1]), 20)).toEqual({ chapters: [2, 3, 4] });
  });

  it('should order the batch even when the briefs arrive unsorted', () => {
    expect(selectGenerationBatch([standard(3), standard(1), standard(2)], new Set(), new Set(), 2)).toEqual({ chapters: [1, 2] });
  });

  it('should stop at an external slot instead of skipping past it', () => {
    const briefs = [standard(1), standard(2), standard(3), external(4), standard(5), standard(6)];
    expect(selectGenerationBatch(briefs, new Set(), new Set(), 20)).toEqual({ chapters: [1, 2, 3], stoppedAtExternalChapter: 4 });
  });

  it('should stop before an external slot that is the immediate next chapter', () => {
    expect(selectGenerationBatch([external(1), standard(2)], new Set(), new Set(), 5)).toEqual({ chapters: [], stoppedAtExternalChapter: 1 });
  });

  it('should stop at the first of several consecutive external slots', () => {
    const briefs = [standard(1), external(2), external(3), external(4), standard(5)];
    expect(selectGenerationBatch(briefs, new Set(), new Set(), 5)).toEqual({ chapters: [1], stoppedAtExternalChapter: 2 });
  });

  it('should resume past an external slot whose chapter is finalized', () => {
    const briefs = [standard(1), external(2), standard(3), standard(4)];
    expect(selectGenerationBatch(briefs, new Set([1, 2]), new Set([1, 2]), 20)).toEqual({ chapters: [3, 4] });
  });

  it('should still stop at an external slot that has a draft but is not finalized', () => {
    const briefs = [standard(1), external(2), standard(3)];
    expect(selectGenerationBatch(briefs, new Set([1, 2]), new Set([1]), 20)).toEqual({ chapters: [], stoppedAtExternalChapter: 2 });
  });

  it('should report no stop when the limit is reached before the external slot', () => {
    const briefs = [standard(1), standard(2), external(3)];
    expect(selectGenerationBatch(briefs, new Set(), new Set(), 2)).toEqual({ chapters: [1, 2] });
  });

  it('should return an empty batch for a project with no briefs', () => {
    expect(selectGenerationBatch([], new Set(), new Set(), 20)).toEqual({ chapters: [] });
  });

  it('should refuse to skip ahead to a planned chapter over chapters with neither a plan nor prose', () => {
    expect(selectGenerationBatch([standard(1), standard(2), standard(3), standard(12)], new Set([1, 2, 3]), new Set([1, 2, 3]), 5)).toEqual({
      chapters: [],
      stoppedAtUnwrittenChapter: 4,
      blockedChapter: 12,
    });
  });

  it('should truncate a batch at the gap after the chapters it can reach', () => {
    expect(selectGenerationBatch([standard(1), standard(2), standard(5)], new Set(), new Set(), 5)).toEqual({ chapters: [1, 2], stoppedAtUnwrittenChapter: 3, blockedChapter: 5 });
  });

  it('should stop at a hole further back than the chapter before, such as empty chapters ahead of an imported draft', () => {
    expect(selectGenerationBatch([standard(11)], new Set([1, 2, 3, 10]), new Set([1, 2, 3]), 5)).toEqual({
      chapters: [],
      stoppedAtUnwrittenChapter: 4,
      blockedChapter: 11,
    });
  });

  it('should fill the hole in order and carry on past a draft that already sits beyond it', () => {
    const briefs = [4, 5, 6, 7, 8, 9, 11].map(standard);
    expect(selectGenerationBatch(briefs, new Set([1, 2, 3, 10]), new Set([1, 2, 3]), 10)).toEqual({ chapters: [4, 5, 6, 7, 8, 9, 11] });
  });

  it('should continue an imported novel whose finalized chapters carry no plans', () => {
    expect(selectGenerationBatch([standard(41), standard(42)], new Set(), new Set(Array.from({ length: 40 }, (_, i) => i + 1)), 5)).toEqual({ chapters: [41, 42] });
  });

  it('should never generate a finalized chapter that has no draft', () => {
    expect(selectGenerationBatch([standard(1), standard(2)], new Set(), new Set([1]), 5)).toEqual({ chapters: [2] });
  });
});

describe('toContentRating', () => {
  it('should keep only levels the SDK recognises for their dimension', () => {
    expect(toContentRating({ sexualContent: 'explicit', violence: 'graphic', darkContent: 'heavy' })).toEqual({
      sexualContent: 'explicit',
      violence: 'graphic',
      darkContent: 'heavy',
    });
    expect(toContentRating({ sexualContent: 'graphic', violence: 'explicit' })).toBeNull();
    expect(toContentRating({ violence: 'mild', darkContent: 'nonsense' })).toEqual({ violence: 'mild' });
  });

  it('should treat a rating with no recognised dimension as unrated rather than none', () => {
    expect(toContentRating({})).toBeNull();
  });
});

describe('declaredDraftFields', () => {
  it('should omit every field the caller did not supply', () => {
    expect(declaredDraftFields({})).toEqual({});
  });

  it('should distinguish an omitted isolated from an explicit false', () => {
    expect('isolated' in declaredDraftFields({})).toBe(false);
    expect(declaredDraftFields({ isolated: false })).toEqual({ isolated: false });
    expect(declaredDraftFields({ isolated: true })).toEqual({ isolated: true });
  });

  it('should carry a supplied state and rating through, clearing an empty rating to unrated', () => {
    expect(declaredDraftFields({ state: { pov: 'Ash' } })).toEqual({ state: { pov: 'Ash' } });
    expect(declaredDraftFields({ contentRating: { violence: 'extreme' } })).toEqual({ contentRating: { violence: 'extreme' } });
    expect(declaredDraftFields({ contentRating: {} })).toEqual({ contentRating: null });
  });
});
