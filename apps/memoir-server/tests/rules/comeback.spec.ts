import { describe, expect, it } from 'bun:test';

import {
  armComebackViaRecovery,
  canFireComeback,
  comebackBonus,
  type ComebackDayState,
  comebackFireAllowance,
  comebackNetXp,
  currentRuleset,
  EMPTY_COMEBACK_DAY_STATE,
  evaluateComebackArming,
  fireComeback,
  type IntensityMode,
  type MomentumBucket,
  type RecentMiss,
  type RewardInput,
  type Strictness,
} from '@modules/rules';

const ruleset = currentRuleset();

const ANCHOR_YESTERDAY: readonly RecentMiss[] = [{ daysAgo: 1, strictness: 'anchor' }];
const ANCHOR_THREE_DAYS_AGO: readonly RecentMiss[] = [{ daysAgo: 3, strictness: 'anchor' }];
const ROUTINE_YESTERDAY: readonly RecentMiss[] = [{ daysAgo: 1, strictness: 'routine' }];
const OPTIONAL_YESTERDAY: readonly RecentMiss[] = [{ daysAgo: 1, strictness: 'optional' }];

const arming = (intensityMode: IntensityMode, recentMisses: readonly RecentMiss[], momentum: MomentumBucket = 'steady', returnerFired = false) =>
  evaluateComebackArming(ruleset, { intensityMode, recentMisses, momentum, returnerFired });

const dayState = (overrides: Partial<ComebackDayState> = {}): ComebackDayState => ({ ...EMPTY_COMEBACK_DAY_STATE, ...overrides });

const rewardInput = (overrides: Partial<RewardInput> = {}): RewardInput => ({
  strictness: 'anchor',
  band: 'on_time',
  completion: 'full',
  streakDays: 0,
  lockActive: false,
  oneShot: 'none',
  ...overrides,
});

describe('evaluateComebackArming', () => {
  const cases: readonly [mode: IntensityMode, misses: readonly RecentMiss[], momentum: MomentumBucket, armed: boolean][] = [
    ['standard', ANCHOR_YESTERDAY, 'warm', true],
    ['standard', ANCHOR_YESTERDAY, 'cold', true],
    ['standard', ANCHOR_THREE_DAYS_AGO, 'cold', true],
    ['standard', ANCHOR_THREE_DAYS_AGO, 'steady', false],
    ['standard', [{ daysAgo: 4, strictness: 'anchor' }], 'cold', false],
    ['standard', ROUTINE_YESTERDAY, 'cold', false],
    ['standard', [], 'cold', false],
    ['low_intensity', ANCHOR_YESTERDAY, 'warm', true],
    ['low_intensity', ROUTINE_YESTERDAY, 'warm', true],
    ['low_intensity', [{ daysAgo: 3, strictness: 'routine' }], 'steady', true],
    ['low_intensity', [{ daysAgo: 4, strictness: 'routine' }], 'cold', false],
    ['low_intensity', OPTIONAL_YESTERDAY, 'cold', false],
    ['high_intensity', ANCHOR_YESTERDAY, 'cold', true],
    ['high_intensity', ANCHOR_THREE_DAYS_AGO, 'cold', false],
    ['high_intensity', ROUTINE_YESTERDAY, 'cold', false],
  ];

  for (const [mode, misses, momentum, armed] of cases) {
    const described = misses.map(miss => `${miss.strictness} ${miss.daysAgo}d ago`).join(', ') || 'no miss';
    it(`should ${armed ? 'arm' : 'stay disarmed'} under ${mode} on ${momentum} momentum after ${described}`, () => {
      expect(arming(mode, misses, momentum).armed).toBe(armed);
    });
  }

  it('should never arm on a miss that has not closed yet', () => {
    expect(arming('standard', [{ daysAgo: 0, strictness: 'anchor' }], 'cold').armed).toBe(false);
  });

  it('should report the trigger that armed the day', () => {
    expect(arming('high_intensity', ANCHOR_YESTERDAY).trigger).toEqual({ kind: 'anchor_miss_yesterday' });
  });

  it('should stand down for the day the returner ritual fires', () => {
    expect(arming('standard', ANCHOR_YESTERDAY, 'cold', true)).toEqual({ armed: false, trigger: null, suppressedByReturner: true });
  });
});

describe('fireComeback', () => {
  it('should allow a single fire on an armed day', () => {
    expect(comebackFireAllowance(ruleset, dayState({ armed: true }))).toBe(1);
  });

  it('should fire once and disarm', () => {
    const fired = fireComeback(ruleset, dayState({ armed: true }), 'anchor');
    expect(fired).toMatchObject({ fired: true, kind: 'fired' });
    expect(fired.state).toEqual(dayState({ armed: false, fires: 1 }));
  });

  it('should refuse a second fire without a recovery quest', () => {
    const once = fireComeback(ruleset, dayState({ armed: true }), 'anchor').state;
    expect(fireComeback(ruleset, once, 'anchor')).toEqual({ fired: false, kind: null, state: once });
  });

  it('should allow a second fire after a recovery quest re-arms the day', () => {
    const once = fireComeback(ruleset, dayState({ armed: true }), 'anchor').state;
    const rearmed = armComebackViaRecovery(once);
    expect(comebackFireAllowance(ruleset, rearmed)).toBe(2);

    const twice = fireComeback(ruleset, rearmed, 'routine');
    expect(twice).toMatchObject({ fired: true, kind: 're_fired' });
    expect(fireComeback(ruleset, twice.state, 'routine').fired).toBe(false);
  });

  it('should refuse to fire on a disarmed day', () => {
    expect(fireComeback(ruleset, dayState(), 'anchor').fired).toBe(false);
  });

  const consumers: Readonly<Record<Strictness, boolean>> = { anchor: true, routine: true, goal: false, recovery: false, optional: false };

  for (const [strictness, consumes] of Object.entries(consumers)) {
    it(`should ${consumes ? 'spend' : 'not spend'} the one-shot on a ${strictness} completion`, () => {
      expect(canFireComeback(ruleset, dayState({ armed: true }), strictness as Strictness)).toBe(consumes);
    });
  }
});

describe('comebackBonus', () => {
  it('should pay the difference the one-shot modifier makes', () => {
    expect(comebackBonus(ruleset, rewardInput({ strictness: 'routine' }))).toEqual({ xp: 5, coins: 1 });
  });

  it('should pay nothing extra on a strictness that never consumes the one-shot', () => {
    expect(comebackBonus(ruleset, rewardInput({ strictness: 'optional' }))).toEqual({ xp: 0, coins: 0 });
  });

  it('should stay bounded by the per-completion XP ceiling', () => {
    const claimed = rewardInput({ streakDays: 100, lockActive: true });
    expect(comebackBonus(ruleset, claimed).xp).toBe(8);
  });
});

describe('comebackNetXp', () => {
  const cases: readonly [forgone: Strictness, claimed: Strictness][] = [
    ['anchor', 'anchor'],
    ['anchor', 'routine'],
    ['routine', 'anchor'],
    ['routine', 'routine'],
  ];

  for (const [forgone, claimed] of cases) {
    it(`should stay net negative when a ${forgone} miss arms a ${claimed} completion`, () => {
      expect(
        comebackNetXp(ruleset, { forgone: rewardInput({ strictness: forgone }), claimed: rewardInput({ strictness: claimed, streakDays: 100, lockActive: true }) }),
      ).toBeLessThan(0);
    });
  }
});
