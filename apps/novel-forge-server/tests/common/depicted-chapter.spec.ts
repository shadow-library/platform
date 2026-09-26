import { describe, expect, it, mock } from 'bun:test';

import { assertDepictableChapter, isDepictedBy, resolveDepiction } from '@server/common';

function frontierDb(latestFinal: number | null) {
  return { query: { chapters: { findFirst: mock(async () => (latestFinal === null ? undefined : { number: latestFinal })) } } } as never;
}

describe('isDepictedBy', () => {
  it('should admit an image at or before the chapter and refuse a later one', () => {
    expect(isDepictedBy(5, 5)).toBe(true);
    expect(isDepictedBy(50, 1)).toBe(false);
  });

  it('should admit a row from before dating, which keeps its old visibility', () => {
    expect(isDepictedBy(null, 1)).toBe(true);
  });
});

describe('assertDepictableChapter', () => {
  it('should allow the frontier chapter itself', () => {
    expect(() => assertDepictableChapter(12, 12)).not.toThrow();
  });

  it('should refuse a chapter past the frontier with ILL_016', () => {
    expect(() => assertDepictableChapter(13, 12)).toThrow(expect.objectContaining({ code: 'ILL_016' }));
  });
});

describe('resolveDepiction', () => {
  it('should stamp an unstated chapter with the latest final chapter', async () => {
    expect(await resolveDepiction(frontierDb(12), 1n)).toEqual({ chapter: 12, frontier: 12 });
  });

  it('should stamp chapter 0 before any chapter is final', async () => {
    expect(await resolveDepiction(frontierDb(null), 1n)).toEqual({ chapter: 0, frontier: 0 });
  });

  it('should keep an earlier chapter and refuse a later one', async () => {
    expect(await resolveDepiction(frontierDb(12), 1n, 3)).toEqual({ chapter: 3, frontier: 12 });
    await expect(resolveDepiction(frontierDb(12), 1n, 13)).rejects.toMatchObject({ code: 'ILL_016' });
  });
});
