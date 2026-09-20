import { describe, expect, it } from 'bun:test';

import { formatCount, formatCountsStrip, resolveCollectionView, seeAllCount, shouldRenderSection, shouldRenderSegments } from '../src/lib/collection-page';

describe('resolveCollectionView', () => {
  it('should show the empty slot when the collection holds nothing', () => {
    expect(resolveCollectionView(0, true)).toEqual({ kind: 'empty' });
  });

  it('should show the collection when it holds items', () => {
    expect(resolveCollectionView(39, true)).toEqual({ kind: 'collection' });
  });

  it('should keep the collection when no empty slot was supplied', () => {
    expect(resolveCollectionView(0, false)).toEqual({ kind: 'collection' });
  });

  it('should keep the collection when the total is unknown', () => {
    expect(resolveCollectionView(undefined, true)).toEqual({ kind: 'collection' });
  });
});

describe('shouldRenderSegments', () => {
  it('should hide a group that offers no choice', () => {
    expect(shouldRenderSegments(0)).toBe(false);
    expect(shouldRenderSegments(1)).toBe(false);
  });

  it('should show a group of two or more', () => {
    expect(shouldRenderSegments(2)).toBe(true);
    expect(shouldRenderSegments(7)).toBe(true);
  });
});

describe('shouldRenderSection', () => {
  it('should drop a section with no items', () => {
    expect(shouldRenderSection(0)).toBe(false);
  });

  it('should keep a section with items', () => {
    expect(shouldRenderSection(18)).toBe(true);
  });
});

describe('seeAllCount', () => {
  it('should offer the full count when the section is truncated', () => {
    expect(seeAllCount(18, 6)).toBe(18);
  });

  it('should offer nothing when every item is on screen', () => {
    expect(seeAllCount(6, 6)).toBeNull();
  });

  it('should offer nothing when more is shown than counted', () => {
    expect(seeAllCount(6, 9)).toBeNull();
  });
});

describe('formatCount', () => {
  it('should group thousands', () => {
    expect(formatCount(1618)).toBe('1,618');
  });

  it('should render zero rather than a negative or fractional count', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(-4)).toBe('0');
    expect(formatCount(3.7)).toBe('3');
    expect(formatCount(Number.NaN)).toBe('0');
  });
});

describe('formatCountsStrip', () => {
  it('should join the counts with middots and keep zeroes', () => {
    const counts = [
      { value: 31, label: 'approved' },
      { value: 4, label: 'drafting' },
      { value: 0, label: 'flagged' },
    ];
    expect(formatCountsStrip(counts)).toBe('31 approved · 4 drafting · 0 flagged');
  });

  it('should render nothing for an empty strip', () => {
    expect(formatCountsStrip([])).toBe('');
  });
});
