import { describe, expect, it } from 'bun:test';

import { computeReward, currentRuleset, type OneShotModifier, type RewardInput, streakTierFor, type Strictness, type TimingBand } from '@modules/rules';

const ruleset = currentRuleset();

const STRICTNESSES: readonly Strictness[] = ['anchor', 'routine', 'goal', 'recovery', 'optional'];
const BANDS: readonly TimingBand[] = ['on_time', 'late_0_2h', 'late_2h_plus', 'day_1', 'day_2', 'day_3', 'day_4'];

const reward = (overrides: Partial<RewardInput>) =>
  computeReward(ruleset, { strictness: 'routine', band: 'on_time', completion: 'full', streakDays: 0, lockActive: false, oneShot: 'none', ...overrides });

describe('streakTierFor', () => {
  const cases: readonly [days: number, id: string, modifier: number][] = [
    [-5, 'none', 1.0],
    [0, 'none', 1.0],
    [2, 'none', 1.0],
    [3, 'bronze', 1.0],
    [6, 'bronze', 1.0],
    [7, 'silver', 1.1],
    [29, 'silver', 1.1],
    [30, 'gold', 1.2],
    [99, 'gold', 1.2],
    [100, 'platinum', 1.3],
    [10_000, 'platinum', 1.3],
  ];

  for (const [days, id, modifier] of cases) {
    it(`should resolve ${id} at ${days} streak days`, () => {
      const tier = streakTierFor(ruleset, days);
      expect(tier.id).toBe(id);
      expect(tier.xpModifier).toBe(modifier);
    });
  }
});

describe('computeReward', () => {
  describe('base XP table', () => {
    const table: Readonly<Record<Strictness, readonly number[]>> = {
      anchor: [12, 8, 5, 3, 1, 0, 0],
      routine: [10, 7, 5, 2, 1, 0, 0],
      goal: [8, 8, 8, 2, 1, 0, 0],
      recovery: [5, 5, 5, 0, 0, 0, 0],
      optional: [8, 8, 8, 1, 0, 0, 0],
    };

    for (const strictness of STRICTNESSES) {
      BANDS.forEach((band, index) => {
        it(`should grant the unmodified ${strictness} base for ${band}`, () => {
          expect(reward({ strictness, band }).xp).toBe(table[strictness][index] ?? -1);
        });
      });
    }
  });

  describe('base coins', () => {
    const baseCoins: Readonly<Record<Strictness, number>> = { anchor: 2, routine: 1, goal: 1, recovery: 0, optional: 1 };

    for (const strictness of STRICTNESSES) {
      it(`should grant ${baseCoins[strictness]} coin(s) for an on-time full ${strictness} completion`, () => {
        expect(reward({ strictness, band: 'on_time' }).coins).toBe(baseCoins[strictness]);
      });

      it(`should grant no coins for a late ${strictness} completion`, () => {
        expect(reward({ strictness, band: 'late_0_2h' }).coins).toBe(0);
        expect(reward({ strictness, band: 'day_1' }).coins).toBe(0);
      });

      it(`should grant no coins for a partial ${strictness} completion`, () => {
        expect(reward({ strictness, band: 'on_time', completion: 'partial' }).coins).toBe(0);
      });
    }
  });

  describe('stat tick', () => {
    it('should always tick once, unmodified, including on partial and zero-XP bands', () => {
      expect(reward({ completion: 'partial' }).statTick).toBe(1);
      expect(reward({ band: 'day_4' }).statTick).toBe(1);
      expect(reward({ streakDays: 100, lockActive: true, oneShot: 'comeback' }).statTick).toBe(1);
    });
  });

  describe('partial halving', () => {
    const cases: readonly [strictness: Strictness, band: TimingBand, xp: number][] = [
      ['anchor', 'on_time', 6],
      ['anchor', 'late_0_2h', 4],
      ['anchor', 'late_2h_plus', 2],
      ['anchor', 'day_1', 1],
      ['anchor', 'day_2', 0],
      ['routine', 'on_time', 5],
      ['routine', 'late_0_2h', 3],
      ['goal', 'on_time', 4],
      ['recovery', 'on_time', 2],
      ['optional', 'on_time', 4],
    ];

    for (const [strictness, band, xp] of cases) {
      it(`should floor half the ${strictness} ${band} base to ${xp}`, () => {
        expect(reward({ strictness, band, completion: 'partial' }).xp).toBe(xp);
      });
    }

    it('should halve before applying modifiers, not after', () => {
      expect(reward({ strictness: 'routine', band: 'late_0_2h', completion: 'partial', oneShot: 'comeback' }).xp).toBe(4);
      expect(Math.floor(Math.floor(7 * 1.5) * 0.5)).toBe(5);
    });
  });

  describe('modifier stacking', () => {
    it('should apply the streak tier alone', () => {
      expect(reward({ strictness: 'anchor', streakDays: 7 }).xp).toBe(Math.floor(12 * 1.1));
      expect(reward({ strictness: 'anchor', streakDays: 30 }).xp).toBe(Math.floor(12 * 1.2));
      expect(reward({ strictness: 'anchor', streakDays: 100 }).xp).toBe(Math.floor(12 * 1.3));
    });

    it('should apply the lock modifier alone', () => {
      expect(reward({ strictness: 'anchor', lockActive: true }).xp).toBe(Math.floor(12 * 1.1));
    });

    it('should apply each one-shot modifier alone', () => {
      expect(reward({ strictness: 'anchor', oneShot: 'returner' }).xp).toBe(Math.floor(12 * 1.2));
      expect(reward({ strictness: 'anchor', oneShot: 'comeback' }).xp).toBe(Math.floor(12 * 1.5));
    });

    it('should multiply streak, then lock, then one-shot in that order', () => {
      const outcome = reward({ strictness: 'routine', streakDays: 100, lockActive: true, oneShot: 'comeback' });
      expect(outcome.modifier).toBe(1.3 * 1.1 * 1.5);
      expect(outcome.xp).toBe(Math.floor(10 * (1.3 * 1.1 * 1.5)));
      expect(outcome.xp).toBe(21);
    });

    it('should apply the ceiling after every modifier, never before', () => {
      const outcome = reward({ strictness: 'anchor', streakDays: 100, lockActive: true, oneShot: 'comeback' });
      expect(outcome.baseXp).toBe(12);
      expect(Math.floor(outcome.baseXp * outcome.modifier)).toBe(25);
      expect(outcome.xp).toBe(25);
    });

    it('should clamp an above-ceiling result to 25', () => {
      const outcome = reward({ strictness: 'anchor', band: 'on_time', streakDays: 100, lockActive: true, oneShot: 'comeback', completion: 'full' });
      expect(outcome.xp).toBe(25);
      expect(outcome.xp).toBeLessThanOrEqual(ruleset.reward.xpCeiling);
    });

    it('should leave a zero base at zero under every modifier', () => {
      expect(reward({ strictness: 'anchor', band: 'day_3', streakDays: 100, lockActive: true, oneShot: 'comeback' }).xp).toBe(0);
    });
  });

  describe('one-shot consumption', () => {
    const consuming: readonly Strictness[] = ['anchor', 'routine'];
    const nonConsuming: readonly Strictness[] = ['goal', 'recovery', 'optional'];
    const oneShots: readonly OneShotModifier[] = ['returner', 'comeback'];

    for (const strictness of consuming) {
      for (const oneShot of oneShots) {
        it(`should consume ${oneShot} on ${strictness}`, () => {
          expect(reward({ strictness, oneShot }).oneShotConsumed).toBe(oneShot);
        });
      }
    }

    for (const strictness of nonConsuming) {
      for (const oneShot of oneShots) {
        it(`should leave ${oneShot} unconsumed on ${strictness}`, () => {
          const outcome = reward({ strictness, oneShot });
          expect(outcome.oneShotConsumed).toBe('none');
          expect(outcome.modifier).toBe(1);
          expect(outcome.xp).toBe(reward({ strictness }).xp);
        });
      }
    }

    it('should add the comeback coin only where the one-shot is consumed', () => {
      expect(reward({ strictness: 'anchor', oneShot: 'comeback' }).coins).toBe(3);
      expect(reward({ strictness: 'routine', oneShot: 'comeback' }).coins).toBe(2);
      expect(reward({ strictness: 'goal', oneShot: 'comeback' }).coins).toBe(1);
      expect(reward({ strictness: 'optional', oneShot: 'comeback' }).coins).toBe(1);
    });

    it('should add the comeback coin on a late or partial completion that earns no base coin', () => {
      expect(reward({ strictness: 'anchor', band: 'day_1', oneShot: 'comeback' }).coins).toBe(1);
      expect(reward({ strictness: 'anchor', completion: 'partial', oneShot: 'comeback' }).coins).toBe(1);
    });

    it('should never add a coin for the returner one-shot', () => {
      expect(reward({ strictness: 'anchor', oneShot: 'returner' }).coins).toBe(2);
    });
  });

  describe('reward bounds', () => {
    const strictnessAt = (n: number) => STRICTNESSES[n % STRICTNESSES.length] ?? 'routine';
    const bandAt = (n: number) => BANDS[n % BANDS.length] ?? 'on_time';
    const oneShotAt = (n: number): OneShotModifier => (['none', 'returner', 'comeback'] as const)[n % 3] ?? 'none';

    it('should keep XP within [0, 25] and coins non-negative across randomized inputs', () => {
      for (let iteration = 0; iteration < 20_000; iteration++) {
        const input: RewardInput = {
          strictness: strictnessAt(Math.floor(Math.random() * 97)),
          band: bandAt(Math.floor(Math.random() * 97)),
          completion: Math.random() < 0.5 ? 'full' : 'partial',
          streakDays: Math.floor(Math.random() * 1200) - 100,
          lockActive: Math.random() < 0.5,
          oneShot: oneShotAt(Math.floor(Math.random() * 97)),
        };

        const outcome = computeReward(ruleset, input);
        expect(outcome.xp).toBeGreaterThanOrEqual(0);
        expect(outcome.xp).toBeLessThanOrEqual(25);
        expect(Number.isInteger(outcome.xp)).toBe(true);
        expect(outcome.coins).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(outcome.coins)).toBe(true);
        expect(outcome.statTick).toBe(1);
      }
    });

    it('should be deterministic for identical inputs', () => {
      const input: RewardInput = { strictness: 'anchor', band: 'late_0_2h', completion: 'partial', streakDays: 42, lockActive: true, oneShot: 'returner' };
      expect(computeReward(ruleset, input)).toEqual(computeReward(ruleset, input));
    });
  });
});
