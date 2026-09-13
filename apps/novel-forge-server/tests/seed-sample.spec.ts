import { describe, expect, it } from 'bun:test';

import { selectSeedSampleChapters } from '@server/common';

describe('selectSeedSampleChapters', () => {
  it('should return everything when the novel has fewer chapters than opening + sample', () => {
    expect(selectSeedSampleChapters([1, 2, 3])).toEqual([1, 2, 3]);
    expect(selectSeedSampleChapters([])).toEqual([]);
  });

  it('should keep the first two chapters and spread the rest evenly across the remainder', () => {
    const chapters = Array.from({ length: 100 }, (_, i) => i + 1);
    const sample = selectSeedSampleChapters(chapters);
    expect(sample.slice(0, 2)).toEqual([1, 2]);
    expect(sample).toHaveLength(8);
    // A late-arriving major character (introduced near chapter 100) must land in the sample.
    expect(Math.max(...sample)).toBeGreaterThan(90);
    expect(new Set(sample).size).toBe(sample.length);
  });

  it('should honor custom opening/sample counts and never duplicate a chapter', () => {
    const sample = selectSeedSampleChapters([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, 3);
    expect(sample[0]).toBe(1);
    expect(new Set(sample).size).toBe(sample.length);
  });
});
