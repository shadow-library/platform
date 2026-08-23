import { describe, expect, it } from 'bun:test';

import {
  computeDayHp,
  currentRuleset,
  energyLowIndicated,
  type HpBreak,
  hpCostFor,
  hpMaxFor,
  hpStartFor,
  type IntensityMode,
  type QuestLogState,
  type Strictness,
} from '@modules/rules';

const ruleset = currentRuleset();

const MODES: readonly IntensityMode[] = ['standard', 'low_intensity', 'high_intensity'];

const breakEvent = (overrides: Partial<HpBreak> = {}): HpBreak => ({
  occurrenceKey: 'quest-1@2026-08-24',
  strictness: 'anchor',
  state: 'missed',
  shielded: false,
  streakDaysBefore: 0,
  ...overrides,
});

describe('hpMaxFor', () => {
  const maxima: Readonly<Record<IntensityMode, number>> = { standard: 5, low_intensity: 8, high_intensity: 3 };

  for (const mode of MODES) {
    it(`should cap ${mode} HP at ${maxima[mode]}`, () => {
      expect(hpMaxFor(ruleset, mode)).toBe(maxima[mode]);
    });
  }
});

describe('hpStartFor', () => {
  const cases: readonly [mode: IntensityMode, previous: number | null, start: number][] = [
    ['standard', null, 5],
    ['standard', 0, 3],
    ['standard', 1, 4],
    ['standard', 3, 5],
    ['standard', 5, 5],
    ['standard', -2, 3],
    ['low_intensity', null, 8],
    ['low_intensity', 0, 5],
    ['low_intensity', 4, 8],
    ['high_intensity', null, 3],
    ['high_intensity', 0, 2],
    ['high_intensity', 2, 3],
  ];

  for (const [mode, previous, start] of cases) {
    it(`should open a ${mode} day at ${start} after ending on ${previous ?? 'no'} HP`, () => {
      expect(hpStartFor(ruleset, mode, previous)).toBe(start);
    });
  }
});

describe('hpCostFor', () => {
  describe('per strictness', () => {
    const costing: Readonly<Record<Strictness, number>> = { anchor: 1, routine: 1, goal: 0, recovery: 0, optional: 0 };

    for (const [strictness, cost] of Object.entries(costing)) {
      it(`should charge ${cost} for a ${strictness} miss under standard intensity`, () => {
        expect(hpCostFor(ruleset, 'standard', breakEvent({ strictness: strictness as Strictness }))).toBe(cost);
      });
    }
  });

  describe('per log state', () => {
    const costing: Readonly<Record<QuestLogState, number>> = {
      missed: 1,
      skipped: 1,
      postponed: 1,
      completed: 0,
      partial: 0,
      late: 0,
      recovery: 0,
      rescheduled: 0,
    };

    for (const [logState, cost] of Object.entries(costing)) {
      it(`should charge ${cost} for a ${logState} anchor occurrence`, () => {
        expect(hpCostFor(ruleset, 'standard', breakEvent({ state: logState as QuestLogState }))).toBe(cost);
      });
    }
  });

  describe('per intensity mode', () => {
    const cases: readonly [mode: IntensityMode, shielded: boolean, streakDaysBefore: number, cost: number][] = [
      ['standard', false, 0, 1],
      ['standard', false, 30, 1],
      ['standard', true, 30, 1],
      ['low_intensity', false, 0, 0],
      ['low_intensity', false, 100, 0],
      ['high_intensity', false, 0, 1],
      ['high_intensity', false, 6, 1],
      ['high_intensity', false, 7, 2],
      ['high_intensity', false, 100, 2],
      ['high_intensity', true, 100, 1],
    ];

    for (const [mode, shielded, streakDaysBefore, cost] of cases) {
      it(`should charge ${cost} under ${mode} for a ${shielded ? 'shielded' : 'unshielded'} break of a ${streakDaysBefore}-day streak`, () => {
        expect(hpCostFor(ruleset, mode, breakEvent({ shielded, streakDaysBefore }))).toBe(cost);
      });
    }
  });
});

describe('computeDayHp', () => {
  it('should regenerate overnight and then spend on every break', () => {
    const day = computeDayHp(ruleset, 'standard', { previousHpEnd: 1, breaks: [breakEvent(), breakEvent({ occurrenceKey: 'quest-2@2026-08-24', strictness: 'routine' })] });
    expect(day).toEqual({ hpStart: 4, hpEnd: 2, hpMax: 5, spent: 2 });
  });

  it('should charge one occurrence once when its miss record and its break both arrive', () => {
    const occurrenceKey = 'quest-1@2026-08-24';
    const day = computeDayHp(ruleset, 'standard', {
      previousHpEnd: 5,
      breaks: [breakEvent({ occurrenceKey, state: 'missed' }), breakEvent({ occurrenceKey, state: 'skipped' })],
    });
    expect(day.spent).toBe(1);
    expect(day.hpEnd).toBe(4);
  });

  it('should keep the higher charge when one occurrence is described twice', () => {
    const occurrenceKey = 'quest-1@2026-08-24';
    const day = computeDayHp(ruleset, 'high_intensity', {
      previousHpEnd: 3,
      breaks: [breakEvent({ occurrenceKey, shielded: true, streakDaysBefore: 30 }), breakEvent({ occurrenceKey, shielded: false, streakDaysBefore: 30 })],
    });
    expect(day.spent).toBe(2);
  });

  it('should floor HP at zero rather than going negative', () => {
    const breaks = Array.from({ length: 9 }, (_value, index) => breakEvent({ occurrenceKey: `quest-${index}@2026-08-24` }));
    expect(computeDayHp(ruleset, 'standard', { previousHpEnd: 0, breaks }).hpEnd).toBe(0);
  });

  it('should never spend HP under low intensity', () => {
    const breaks = Array.from({ length: 5 }, (_value, index) => breakEvent({ occurrenceKey: `quest-${index}@2026-08-24` }));
    expect(computeDayHp(ruleset, 'low_intensity', { previousHpEnd: 8, breaks })).toEqual({ hpStart: 8, hpEnd: 8, hpMax: 8, spent: 0 });
  });

  it('should open a first day at full HP', () => {
    expect(computeDayHp(ruleset, 'standard', { previousHpEnd: null, breaks: [] })).toEqual({ hpStart: 5, hpEnd: 5, hpMax: 5, spent: 0 });
  });
});

describe('energyLowIndicated', () => {
  const cases: readonly [mode: IntensityMode, misses: number, indicated: boolean][] = [
    ['standard', 0, false],
    ['standard', 1, false],
    ['standard', 2, true],
    ['standard', 5, true],
    ['high_intensity', 1, false],
    ['high_intensity', 2, true],
    ['low_intensity', 1, false],
    ['low_intensity', 2, false],
    ['low_intensity', 9, false],
  ];

  for (const [mode, misses, indicated] of cases) {
    it(`should ${indicated ? 'indicate' : 'stay quiet'} after ${misses} miss(es) under ${mode}`, () => {
      expect(energyLowIndicated(mode, misses)).toBe(indicated);
    });
  }
});
