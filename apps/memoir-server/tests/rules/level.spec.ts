import { describe, expect, it } from 'bun:test';

import { currentRuleset, levelFor, xpThresholdForLevel, xpToAdvance } from '@modules/rules';

const ruleset = currentRuleset();
const MAX_LEVEL = 999;

describe('xpToAdvance', () => {
  const cases: readonly [level: number, cost: number][] = [
    [1, 100],
    [2, 283],
    [3, 520],
    [4, 800],
    [9, 2_700],
    [16, 6_400],
    [100, 100_000],
  ];

  for (const [level, cost] of cases) {
    it(`should cost ${cost} XP to advance from level ${level}`, () => {
      expect(xpToAdvance(ruleset, level)).toBe(cost);
    });
  }

  it('should follow round(100 x level^1.5) across the whole curve', () => {
    for (let level = 1; level < MAX_LEVEL; level++) expect(xpToAdvance(ruleset, level)).toBe(Math.round(100 * Math.pow(level, 1.5)));
  });

  it('should cost nothing to advance from the maximum level', () => {
    expect(xpToAdvance(ruleset, MAX_LEVEL)).toBe(0);
    expect(xpToAdvance(ruleset, MAX_LEVEL + 1)).toBe(0);
  });

  it('should cost nothing below level 1', () => {
    expect(xpToAdvance(ruleset, 0)).toBe(0);
    expect(xpToAdvance(ruleset, -4)).toBe(0);
  });
});

describe('xpThresholdForLevel', () => {
  const cases: readonly [level: number, threshold: number][] = [
    [1, 0],
    [2, 100],
    [3, 383],
    [4, 903],
    [5, 1_703],
  ];

  for (const [level, threshold] of cases) {
    it(`should place level ${level} at ${threshold} lifetime XP`, () => {
      expect(xpThresholdForLevel(ruleset, level)).toBe(threshold);
    });
  }

  it('should increase strictly with level', () => {
    let previous = -1;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const threshold = xpThresholdForLevel(ruleset, level);
      expect(threshold).toBeGreaterThan(previous);
      previous = threshold;
    }
  });

  it('should clamp out-of-range levels to the curve ends', () => {
    expect(xpThresholdForLevel(ruleset, 0)).toBe(xpThresholdForLevel(ruleset, 1));
    expect(xpThresholdForLevel(ruleset, -50)).toBe(xpThresholdForLevel(ruleset, 1));
    expect(xpThresholdForLevel(ruleset, MAX_LEVEL + 500)).toBe(xpThresholdForLevel(ruleset, MAX_LEVEL));
  });
});

describe('levelFor', () => {
  const cases: readonly [xp: number, level: number][] = [
    [-1_000, 1],
    [0, 1],
    [1, 1],
    [99, 1],
    [100, 2],
    [382, 2],
    [383, 3],
    [902, 3],
    [903, 4],
    [1_702, 4],
    [1_703, 5],
  ];

  for (const [xp, level] of cases) {
    it(`should place ${xp} lifetime XP at level ${level}`, () => {
      expect(levelFor(ruleset, xp)).toBe(level);
    });
  }

  it('should land exactly on every level boundary across the whole curve', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const threshold = xpThresholdForLevel(ruleset, level);
      expect(levelFor(ruleset, threshold)).toBe(level);
      expect(levelFor(ruleset, threshold - 1)).toBe(level - 1);
    }
  });

  it('should cap at level 999 no matter how much XP is accumulated', () => {
    const maxThreshold = xpThresholdForLevel(ruleset, MAX_LEVEL);
    expect(levelFor(ruleset, maxThreshold)).toBe(MAX_LEVEL);
    expect(levelFor(ruleset, maxThreshold + 1)).toBe(MAX_LEVEL);
    expect(levelFor(ruleset, maxThreshold * 1_000)).toBe(MAX_LEVEL);
    expect(levelFor(ruleset, Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
  });

  it('should never decrease as lifetime XP grows', () => {
    let previous = 1;
    for (let xp = 0; xp < 200_000; xp += 137) {
      const level = levelFor(ruleset, xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});
