import { describe, expect, it } from 'bun:test';

import {
  crownBankAmount,
  type CrownCadence,
  crownCadenceFor,
  crownPeriodOf,
  crownShare,
  crownWeightFor,
  currentRuleset,
  endowCrown,
  forfeitCrownSlice,
  type IntensityMode,
  isCrownPeriodClose,
  type LocalDate,
  parseLocalDate,
  recomputeCrownDay,
  rescaleCrown,
  type Strictness,
} from '@modules/rules';

const ruleset = currentRuleset();

const date = (iso: string): LocalDate => {
  const parsed = parseLocalDate(iso);
  if (!parsed) throw new TypeError(`fixture is not an ISO date: ${iso}`);
  return parsed;
};

const A_DAY: readonly number[] = [1.5, 1.0, 1.0];

describe('crownWeightFor', () => {
  const weights: Readonly<Record<Strictness, number>> = { anchor: 1.5, routine: 1.0, goal: 1.0, recovery: 0, optional: 0 };

  for (const [strictness, weight] of Object.entries(weights)) {
    it(`should weight a ${strictness} occurrence at ${weight}`, () => {
      expect(crownWeightFor(ruleset, strictness as Strictness)).toBe(weight);
    });
  }
});

describe('crownCadenceFor', () => {
  const cadences: Readonly<Record<IntensityMode, CrownCadence>> = { standard: 'daily', low_intensity: 'weekly', high_intensity: 'daily' };

  for (const [mode, cadence] of Object.entries(cadences)) {
    it(`should run a ${cadence} crown period under ${mode}`, () => {
      expect(crownCadenceFor(ruleset, mode as IntensityMode)).toBe(cadence);
    });
  }
});

describe('crownShare', () => {
  const cases: readonly [weight: number, xp: number, coins: number][] = [
    [0, 0, 0],
    [1, 4, 1],
    [1.5, 6, 1],
    [3.5, 14, 2],
    [4, 16, 2],
    [9, 36, 5],
    [20, 80, 5],
  ];

  for (const [weight, xp, coins] of cases) {
    it(`should share weight ${weight} as ${xp} XP and ${coins} coins`, () => {
      expect(crownShare(ruleset, weight)).toEqual({ xp, coins });
    });
  }
});

describe('endowCrown', () => {
  it('should endow the period from the scheduled weights', () => {
    expect(endowCrown(ruleset, A_DAY)).toEqual({ endowedWeight: 3.5, forfeitedWeight: 0, grantedXp: 14, grantedCoins: 2, remainingXp: 14, remainingCoins: 2 });
  });

  it('should endow nothing for a day of recovery and optional quests only', () => {
    expect(endowCrown(ruleset, [0, 0])).toEqual({ endowedWeight: 0, forfeitedWeight: 0, grantedXp: 0, grantedCoins: 0, remainingXp: 0, remainingCoins: 0 });
  });
});

describe('forfeitCrownSlice', () => {
  it('should bank the full grant when nothing is forfeited', () => {
    const day = endowCrown(ruleset, A_DAY);
    expect(day.remainingXp).toBe(day.grantedXp);
    expect(day.remainingCoins).toBe(day.grantedCoins);
  });

  it('should recompute the remainder from the surviving weight', () => {
    const day = forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), 1.5);
    expect(day.forfeitedWeight).toBe(1.5);
    expect(day.remainingXp).toBe(8);
    expect(day.remainingCoins).toBe(1);
  });

  it('should leave nothing after every slice is forfeited', () => {
    const day = A_DAY.reduce((current, weight) => forfeitCrownSlice(ruleset, current, weight), endowCrown(ruleset, A_DAY));
    expect(day).toMatchObject({ forfeitedWeight: 3.5, remainingXp: 0, remainingCoins: 0 });
  });

  it('should clamp a forfeit larger than the endowment', () => {
    const day = forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), 99);
    expect(day.forfeitedWeight).toBe(3.5);
    expect(day.remainingXp).toBe(0);
  });

  it('should ignore a negative forfeit', () => {
    expect(forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), -5)).toEqual(endowCrown(ruleset, A_DAY));
  });
});

describe('rescaleCrown', () => {
  it('should never lift the remainder above the weight the period opened with', () => {
    const day = rescaleCrown(ruleset, endowCrown(ruleset, A_DAY), [...A_DAY, 1.5, 1.5]);
    expect(day.endowedWeight).toBe(6.5);
    expect(day.remainingXp).toBe(14);
    expect(day.remainingCoins).toBe(2);
  });

  it('should shrink the remainder when a quest leaves the period', () => {
    const day = rescaleCrown(ruleset, endowCrown(ruleset, A_DAY), [1.5]);
    expect(day.remainingXp).toBe(6);
    expect(day.remainingCoins).toBe(1);
  });

  it('should clamp a forfeit that outlives its own weight', () => {
    const forfeited = forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), 3.5);
    expect(rescaleCrown(ruleset, forfeited, [1.5]).forfeitedWeight).toBe(1.5);
  });
});

describe('crownPeriodOf', () => {
  it('should treat each day as its own daily period', () => {
    expect(crownPeriodOf(ruleset, 'daily', date('2026-08-26'))).toEqual({ cadence: 'daily', start: date('2026-08-26'), closesOn: date('2026-08-26') });
  });

  const weekly: readonly [day: string, start: string][] = [
    ['2026-08-24', '2026-08-24'],
    ['2026-08-26', '2026-08-24'],
    ['2026-08-30', '2026-08-24'],
    ['2026-08-31', '2026-08-31'],
  ];

  for (const [day, start] of weekly) {
    it(`should anchor the week containing ${day} on ${start}`, () => {
      expect(crownPeriodOf(ruleset, 'weekly', date(day))).toEqual({ cadence: 'weekly', start: date(start), closesOn: date(start === '2026-08-24' ? '2026-08-30' : '2026-09-06') });
    });
  }
});

describe('isCrownPeriodClose', () => {
  it('should close every daily period', () => {
    expect(isCrownPeriodClose(ruleset, 'daily', date('2026-08-26'))).toBe(true);
  });

  const weekly: readonly [day: string, closes: boolean][] = [
    ['2026-08-24', false],
    ['2026-08-26', false],
    ['2026-08-30', true],
    ['2026-08-31', false],
  ];

  for (const [day, closes] of weekly) {
    it(`should ${closes ? 'close' : 'not close'} the weekly period on ${day}`, () => {
      expect(isCrownPeriodClose(ruleset, 'weekly', date(day))).toBe(closes);
    });
  }
});

describe('crownBankAmount', () => {
  it('should bank a single day under the daily cadence', () => {
    expect(crownBankAmount([endowCrown(ruleset, A_DAY)])).toEqual({ xp: 14, coins: 2 });
  });

  it('should accumulate the daily remainders across a weekly period', () => {
    const clean = endowCrown(ruleset, A_DAY);
    const slipped = forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), 1.5);
    expect(crownBankAmount([clean, slipped, clean])).toEqual({ xp: 36, coins: 5 });
  });

  it('should bank nothing for an empty period', () => {
    expect(crownBankAmount([])).toEqual({ xp: 0, coins: 0 });
  });
});

describe('recomputeCrownDay', () => {
  it('should agree with applying the forfeits one at a time', () => {
    const incremental = forfeitCrownSlice(ruleset, forfeitCrownSlice(ruleset, endowCrown(ruleset, A_DAY), 1.5), 1);
    expect(recomputeCrownDay(ruleset, A_DAY, [1.5, 1])).toEqual(incremental);
  });
});
