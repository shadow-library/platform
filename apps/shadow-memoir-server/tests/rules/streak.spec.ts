import { describe, expect, it } from 'bun:test';

import {
  applyStreakEvent,
  currentRuleset,
  EMPTY_STREAK_STATE,
  grantStreakShield,
  type IntensityMode,
  type QuestLogState,
  recomputeStreak,
  streakApplies,
  type StreakEvent,
  type StreakOutcome,
  type StreakState,
  type Strictness,
} from '@modules/rules';

const ruleset = currentRuleset();

const event = (overrides: Partial<StreakEvent> = {}): StreakEvent => ({
  state: 'completed',
  strictness: 'routine',
  intensityMode: 'standard',
  streakOptIn: false,
  onTime: true,
  ...overrides,
});

const state = (overrides: Partial<StreakState> = {}): StreakState => ({ ...EMPTY_STREAK_STATE, ...overrides });

const apply = (initial: StreakState, overrides: Partial<StreakEvent> = {}) => applyStreakEvent(ruleset, initial, event(overrides));

const STATES: readonly QuestLogState[] = ['completed', 'partial', 'late', 'recovery', 'skipped', 'missed', 'postponed', 'rescheduled'];

describe('streakApplies', () => {
  const cases: readonly [strictness: Strictness, optIn: boolean, applies: boolean][] = [
    ['anchor', false, true],
    ['routine', false, true],
    ['goal', false, true],
    ['recovery', false, false],
    ['recovery', true, false],
    ['optional', false, false],
    ['optional', true, true],
  ];

  for (const [strictness, optIn, applies] of cases) {
    it(`should ${applies ? 'apply' : 'not apply'} to a ${strictness} quest with opt-in ${optIn}`, () => {
      expect(streakApplies(ruleset, strictness, optIn)).toBe(applies);
    });
  }
});

describe('applyStreakEvent', () => {
  describe('outcome per log state', () => {
    const unshielded: Readonly<Record<QuestLogState, StreakOutcome>> = {
      completed: 'hold',
      partial: 'hold',
      late: 'hold',
      recovery: 'hold',
      skipped: 'break',
      missed: 'break',
      postponed: 'break',
      rescheduled: 'neutral',
    };

    for (const logState of STATES) {
      it(`should resolve ${logState} to ${unshielded[logState]} without a shield`, () => {
        expect(apply(state({ currentDays: 4 }), { state: logState }).outcome).toBe(unshielded[logState]);
      });

      it(`should resolve ${logState} to ${unshielded[logState] === 'break' ? 'bridge' : unshielded[logState]} with a shield`, () => {
        const expected = unshielded[logState] === 'break' ? 'bridge' : unshielded[logState];
        expect(apply(state({ currentDays: 4, shields: 1 }), { state: logState }).outcome).toBe(expected);
      });
    }
  });

  it('should leave a rescheduled occurrence neutral in every respect', () => {
    const initial = state({ currentDays: 9, longestDays: 12, shields: 1, completionsTowardShield: 3 });
    const transition = apply(initial, { state: 'rescheduled' });
    expect(transition.state).toEqual(initial);
    expect(transition.shieldsConsumed).toBe(0);
    expect(transition.shieldsEarned).toBe(0);
  });

  it('should ignore an optional quest that never opted in', () => {
    const initial = state({ currentDays: 6, shields: 1 });
    expect(apply(initial, { strictness: 'optional', state: 'missed' }).state).toEqual(initial);
    expect(apply(initial, { strictness: 'optional', state: 'completed' }).state).toEqual(initial);
  });

  it('should track an opted-in optional quest like any other', () => {
    const transition = apply(state({ currentDays: 6 }), { strictness: 'optional', streakOptIn: true });
    expect(transition.outcome).toBe('hold');
    expect(transition.state.currentDays).toBe(7);
  });

  describe('holds', () => {
    it('should advance the run and the longest run together', () => {
      const transition = apply(state({ currentDays: 4, longestDays: 4 }));
      expect(transition.state.currentDays).toBe(5);
      expect(transition.state.longestDays).toBe(5);
    });

    it('should leave a longest run set by an earlier streak untouched', () => {
      expect(apply(state({ currentDays: 1, longestDays: 40 })).state.longestDays).toBe(40);
    });

    const milestones: readonly [before: number, milestone: string | null][] = [
      [0, null],
      [1, null],
      [2, 'bronze'],
      [3, null],
      [6, 'silver'],
      [29, 'gold'],
      [99, 'platinum'],
      [100, null],
    ];

    for (const [before, milestone] of milestones) {
      it(`should report ${milestone ?? 'no'} milestone on the hold after day ${before}`, () => {
        expect(apply(state({ currentDays: before })).milestone).toBe(milestone);
      });
    }
  });

  describe('shield accrual', () => {
    const cadences: readonly [mode: IntensityMode, cadence: number][] = [
      ['standard', 7],
      ['low_intensity', 5],
      ['high_intensity', 10],
    ];

    for (const [intensityMode, cadence] of cadences) {
      it(`should earn a shield every ${cadence} completions under ${intensityMode}`, () => {
        let current = EMPTY_STREAK_STATE;
        for (let index = 0; index < cadence - 1; index++) current = apply(current, { intensityMode }).state;
        expect(current.shields).toBe(0);
        expect(current.completionsTowardShield).toBe(cadence - 1);

        const earning = apply(current, { intensityMode });
        expect(earning.shieldsEarned).toBe(1);
        expect(earning.state.shields).toBe(1);
        expect(earning.state.completionsTowardShield).toBe(0);
      });

      it(`should cap ${intensityMode} shields at two`, () => {
        let current = EMPTY_STREAK_STATE;
        for (let index = 0; index < cadence * 4; index++) current = apply(current, { intensityMode }).state;
        expect(current.shields).toBe(ruleset.shields.capPerQuest);
      });
    }

    const accrual: readonly [state: QuestLogState, onTime: boolean, accrues: boolean][] = [
      ['completed', true, true],
      ['completed', false, false],
      ['partial', false, true],
      ['late', false, false],
      ['recovery', true, true],
    ];

    for (const [logState, onTime, accrues] of accrual) {
      it(`should ${accrues ? 'count' : 'not count'} a ${logState} hold with onTime ${onTime} toward the next shield`, () => {
        expect(apply(state({ completionsTowardShield: 2 }), { state: logState, onTime }).state.completionsTowardShield).toBe(accrues ? 3 : 2);
      });
    }
  });

  describe('bridges', () => {
    it('should spend one shield and preserve the run', () => {
      const transition = apply(state({ currentDays: 12, longestDays: 12, shields: 2, completionsTowardShield: 4 }), { state: 'missed' });
      expect(transition.shieldsConsumed).toBe(1);
      expect(transition.state).toEqual(state({ currentDays: 12, longestDays: 12, shields: 1, completionsTowardShield: 4 }));
      expect(transition.announceBreak).toBe(false);
    });

    it('should bridge a goal postpone, which costs a shield but no HP', () => {
      const transition = apply(state({ currentDays: 3, shields: 1 }), { strictness: 'goal', state: 'postponed' });
      expect(transition.outcome).toBe('bridge');
      expect(transition.state.shields).toBe(0);
    });
  });

  describe('breaks', () => {
    it('should reset the run, the shields, and the accrual counter', () => {
      const transition = apply(state({ currentDays: 9, longestDays: 20, completionsTowardShield: 5 }), { state: 'skipped' });
      expect(transition.state).toEqual(state({ currentDays: 0, longestDays: 20, shields: 0, completionsTowardShield: 0 }));
      expect(transition.endedAtDays).toBe(9);
    });

    const announcements: readonly [days: number, announced: boolean][] = [
      [0, false],
      [1, false],
      [6, false],
      [7, true],
      [40, true],
    ];

    for (const [days, announced] of announcements) {
      it(`should ${announced ? 'announce' : 'stay silent about'} a break at ${days} days`, () => {
        expect(apply(state({ currentDays: days }), { state: 'missed' }).announceBreak).toBe(announced);
      });
    }
  });
});

describe('grantStreakShield', () => {
  it('should grant immediately below the cap', () => {
    const result = grantStreakShield(ruleset, state({ shields: 1 }), 1);
    expect(result).toEqual({ state: state({ shields: 2 }), granted: 1, heldPending: 0 });
  });

  it('should hold the grant pending at the cap', () => {
    const result = grantStreakShield(ruleset, state({ shields: 2 }), 1);
    expect(result.granted).toBe(0);
    expect(result.heldPending).toBe(1);
    expect(result.state.pendingShieldGrant).toBe(1);
  });

  it('should release a pending grant the moment a bridge frees a slot', () => {
    const held = grantStreakShield(ruleset, state({ currentDays: 5, shields: 2 }), 1).state;
    const bridged = apply(held, { state: 'missed' });
    expect(bridged.outcome).toBe('bridge');
    expect(bridged.state.shields).toBe(2);
    expect(bridged.state.pendingShieldGrant).toBe(0);
  });

  it('should ignore a negative grant', () => {
    expect(grantStreakShield(ruleset, state({ shields: 1 }), -3).state).toEqual(state({ shields: 1 }));
  });
});

describe('recomputeStreak', () => {
  it('should agree with the incremental fold over the same history', () => {
    const history: readonly StreakEvent[] = [
      ...Array.from({ length: 8 }, () => event()),
      event({ state: 'missed' }),
      event({ state: 'rescheduled' }),
      ...Array.from({ length: 3 }, () => event({ state: 'partial', onTime: false })),
      event({ state: 'postponed' }),
      event({ state: 'late', onTime: false }),
    ];

    let incremental = EMPTY_STREAK_STATE;
    for (const entry of history) incremental = applyStreakEvent(ruleset, incremental, entry).state;

    expect(recomputeStreak(ruleset, history)).toEqual(incremental);
  });

  it('should replay from an explicit initial state', () => {
    const initial = state({ currentDays: 2, longestDays: 5, shields: 1 });
    expect(recomputeStreak(ruleset, [event(), event({ state: 'missed' })], initial).currentDays).toBe(3);
  });
});
