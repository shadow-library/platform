import { describe, expect, it } from 'bun:test';

import { computeMomentum, currentRuleset, medianOf, type MomentumBucket, trailingMedian } from '@modules/rules';

const ruleset = currentRuleset();

const flat = (value: number, days = ruleset.momentum.medianWindowDays): readonly number[] => Array.from({ length: days }, () => value);

const momentum = (recent: readonly [number, number, number], trailing: readonly number[]) => computeMomentum(ruleset, { recentCompletions: recent, trailingCompletions: trailing });

describe('medianOf', () => {
  const cases: readonly [values: readonly number[], median: number][] = [
    [[], 0],
    [[4], 4],
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
    [[0, 0, 0, 9], 0],
  ];

  for (const [values, median] of cases) {
    it(`should take the median of [${values.join(', ')}] as ${median}`, () => {
      expect(medianOf(values)).toBe(median);
    });
  }
});

describe('trailingMedian', () => {
  it('should read only the leading window of the most-recent-first history', () => {
    expect(trailingMedian([4, 4, 4, 100, 100, 100], 3)).toBe(4);
  });

  it('should ignore a window longer than the history', () => {
    expect(trailingMedian([2, 4], 14)).toBe(3);
  });

  it('should treat a zero-length window as no history', () => {
    expect(trailingMedian([5, 5], 0)).toBe(0);
  });
});

describe('computeMomentum', () => {
  it('should weight today, yesterday, and the day before at 1.0, 0.7, and 0.5', () => {
    expect(momentum([2, 1, 4], flat(3)).weighted).toBe(2 + 0.7 + 2);
  });

  it('should ignore negative completion counts', () => {
    expect(momentum([-5, 0, 0], flat(3)).weighted).toBe(0);
  });

  const buckets: readonly [recent: [number, number, number], median: number, bucket: MomentumBucket, ratio: number][] = [
    [[0, 0, 0], 4, 'cold', 0],
    [[1, 0, 0], 4, 'cold', 0.25],
    [[2, 0, 0], 10, 'cold', 0.2],
    [[3, 0, 0], 10, 'steady', 0.3],
    [[4, 0, 0], 4, 'steady', 1],
    [[11, 0, 0], 10, 'steady', 1.1],
    [[12, 0, 0], 10, 'warm', 1.2],
    [[10, 0, 0], 4, 'warm', 2.5],
  ];

  for (const [recent, median, bucket, ratio] of buckets) {
    it(`should bucket a ratio of ${ratio} as ${bucket}`, () => {
      const result = momentum(recent, flat(median));
      expect(result.median).toBe(median);
      expect(result.ratio).toBeCloseTo(ratio, 6);
      expect(result.bucket).toBe(bucket);
    });
  }

  it('should read cold from a silent history with no completions at all', () => {
    expect(momentum([0, 0, 0], [])).toEqual({ weighted: 0, median: 0, ratio: null, bucket: 'cold' });
  });

  it('should read warm from a first burst against an empty history', () => {
    expect(momentum([3, 0, 0], flat(0))).toEqual({ weighted: 3, median: 0, ratio: null, bucket: 'warm' });
  });

  it('should compare against the trailing fourteen days only', () => {
    const trailing = [...flat(1, 14), ...flat(50, 30)];
    expect(momentum([1, 0, 0], trailing).bucket).toBe('steady');
  });
});
