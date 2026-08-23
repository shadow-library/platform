import { describe, expect, it } from 'bun:test';

import { currentRuleset, resolveTimingBand, type Strictness, type TimingBand, type TimingBandInput } from '@modules/rules';

const ruleset = currentRuleset();

const ANCHOR_START = 540;
const ROUTINE_DURATION = 45;

const at = (overrides: Partial<TimingBandInput>): TimingBandInput => ({
  strictness: 'routine',
  startMinute: ANCHOR_START,
  durationMinutes: ROUTINE_DURATION,
  daysElapsed: 0,
  minuteOfDay: ANCHOR_START,
  ...overrides,
});

describe('resolveTimingBand', () => {
  describe('anchor within-day boundaries', () => {
    const cases: readonly [label: string, minuteOfDay: number, band: TimingBand][] = [
      ['before the start minute', ANCHOR_START - 1, 'on_time'],
      ['at the start minute', ANCHOR_START, 'on_time'],
      ['one minute before the grace edge', ANCHOR_START + 29, 'on_time'],
      ['exactly on the grace edge', ANCHOR_START + 30, 'late_0_2h'],
      ['one minute past the grace edge', ANCHOR_START + 31, 'late_0_2h'],
      ['one minute before the two-hour edge', ANCHOR_START + 30 + 119, 'late_0_2h'],
      ['exactly on the two-hour edge', ANCHOR_START + 30 + 120, 'late_2h_plus'],
      ['one minute past the two-hour edge', ANCHOR_START + 30 + 121, 'late_2h_plus'],
      ['at the end of the local day', 1439, 'late_2h_plus'],
    ];

    for (const [label, minuteOfDay, band] of cases) {
      it(`should resolve ${band} ${label}`, () => {
        expect(resolveTimingBand(ruleset, at({ strictness: 'anchor', minuteOfDay }))).toBe(band);
      });
    }
  });

  describe('routine within-day boundaries', () => {
    const windowEnd = ANCHOR_START + ROUTINE_DURATION;
    const cases: readonly [label: string, minuteOfDay: number, band: TimingBand][] = [
      ['before the start minute', ANCHOR_START - 1, 'on_time'],
      ['at the start minute', ANCHOR_START, 'on_time'],
      ['one minute before the duration edge', windowEnd - 1, 'on_time'],
      ['exactly on the duration edge', windowEnd, 'late_0_2h'],
      ['one minute before the two-hour edge', windowEnd + 119, 'late_0_2h'],
      ['exactly on the two-hour edge', windowEnd + 120, 'late_2h_plus'],
      ['at the end of the local day', 1439, 'late_2h_plus'],
    ];

    for (const [label, minuteOfDay, band] of cases) {
      it(`should resolve ${band} ${label}`, () => {
        expect(resolveTimingBand(ruleset, at({ strictness: 'routine', minuteOfDay }))).toBe(band);
      });
    }
  });

  describe('day-level strictnesses', () => {
    const dayLevel: readonly Strictness[] = ['goal', 'recovery', 'optional'];

    for (const strictness of dayLevel) {
      it(`should treat the whole day as on-time for ${strictness}`, () => {
        for (const minuteOfDay of [0, ANCHOR_START, ANCHOR_START + 30, ANCHOR_START + 600, 1439]) {
          expect(resolveTimingBand(ruleset, at({ strictness, minuteOfDay }))).toBe('on_time');
        }
      });
    }

    it('should ignore the grace edge for a day-level quest that carries a start minute', () => {
      expect(resolveTimingBand(ruleset, at({ strictness: 'goal', minuteOfDay: 1439 }))).toBe('on_time');
    });
  });

  describe('untimed quests', () => {
    it('should treat an untimed routine as day-level', () => {
      expect(resolveTimingBand(ruleset, at({ strictness: 'routine', startMinute: null, minuteOfDay: 1439 }))).toBe('on_time');
    });

    it('should treat an untimed anchor as day-level', () => {
      expect(resolveTimingBand(ruleset, at({ strictness: 'anchor', startMinute: null, minuteOfDay: 1439 }))).toBe('on_time');
    });
  });

  describe('zero-duration routine', () => {
    it('should be late from the start minute onward when the window has no width', () => {
      expect(resolveTimingBand(ruleset, at({ durationMinutes: 0, minuteOfDay: ANCHOR_START - 1 }))).toBe('on_time');
      expect(resolveTimingBand(ruleset, at({ durationMinutes: 0, minuteOfDay: ANCHOR_START }))).toBe('late_0_2h');
    });
  });

  describe('elapsed-day boundaries', () => {
    const cases: readonly [daysElapsed: number, band: TimingBand][] = [
      [1, 'day_1'],
      [2, 'day_2'],
      [3, 'day_3'],
      [4, 'day_4'],
      [5, 'day_4'],
      [90, 'day_4'],
    ];

    for (const [daysElapsed, band] of cases) {
      it(`should resolve ${band} at ${daysElapsed} elapsed day(s)`, () => {
        expect(resolveTimingBand(ruleset, at({ daysElapsed }))).toBe(band);
      });
    }

    it('should ignore the minute of day once a day has elapsed', () => {
      expect(resolveTimingBand(ruleset, at({ daysElapsed: 1, minuteOfDay: 0 }))).toBe('day_1');
      expect(resolveTimingBand(ruleset, at({ daysElapsed: 1, minuteOfDay: 1439 }))).toBe('day_1');
    });

    it('should clamp a negative elapsed-day count to the occurrence day', () => {
      expect(resolveTimingBand(ruleset, at({ daysElapsed: -3, minuteOfDay: ANCHOR_START }))).toBe('on_time');
    });
  });
});
