import { describe, expect, it } from 'bun:test';

import { anchorSoftCapWarned, type CapacityWarning, capacityWarningFor, computeCapacity, currentRuleset, type MomentumBucket } from '@modules/rules';

const ruleset = currentRuleset();

const flat = (value: number, days = ruleset.capacity.medianWindowDays): readonly number[] => Array.from({ length: days }, () => value);

const capacityOf = (trailingCompletions: readonly number[], momentum: MomentumBucket = 'steady', priorDayHeavyMiss = false) =>
  computeCapacity(ruleset, { trailingCompletions, momentum, priorDayHeavyMiss });

describe('computeCapacity', () => {
  it('should seat a new user at the baseline cap', () => {
    expect(capacityOf([])).toEqual({ baseline: 14, capacity: 14 });
  });

  const ratchets: readonly [median: number, capacity: number][] = [
    [1, 1],
    [2, 2],
    [4, 5],
    [10, 12],
    [20, 23],
  ];

  for (const [median, capacity] of ratchets) {
    it(`should ratchet a trailing median of ${median} to ${capacity}`, () => {
      expect(capacityOf(flat(median)).capacity).toBe(capacity);
    });
  }

  it('should lower capacity while momentum is cold', () => {
    expect(capacityOf(flat(10), 'cold').capacity).toBe(8);
  });

  it('should lower capacity after a heavy-miss day', () => {
    expect(capacityOf(flat(10), 'steady', true).capacity).toBe(10);
  });

  it('should compound the cold and heavy-miss factors', () => {
    expect(capacityOf(flat(10), 'cold', true).capacity).toBe(7);
  });

  it('should never fall below a single quest', () => {
    expect(capacityOf(flat(0), 'cold', true).capacity).toBe(1);
  });

  it('should read only the trailing fourteen days', () => {
    expect(capacityOf([...flat(2, 14), ...flat(40, 20)]).capacity).toBe(2);
  });
});

describe('capacityWarningFor', () => {
  const cases: readonly [planned: number, capacity: number, onLockAttempt: boolean, daysSinceLastSoftWarning: number | null, warning: CapacityWarning][] = [
    [8, 10, false, null, 'none'],
    [10, 10, false, null, 'none'],
    [11, 10, false, null, 'soft'],
    [11, 10, false, 7, 'soft'],
    [11, 10, false, 6, 'none'],
    [11, 10, false, 0, 'none'],
    [13, 10, false, null, 'soft'],
    [14, 10, false, null, 'soft'],
    [13, 10, true, null, 'soft'],
    [14, 10, true, null, 'modal'],
    [14, 10, true, 0, 'modal'],
    [1, 0, false, null, 'soft'],
  ];

  for (const [plannedLoad, capacity, onLockAttempt, daysSinceLastSoftWarning, warning] of cases) {
    it(`should raise ${warning} for ${plannedLoad} planned against ${capacity}${onLockAttempt ? ' on a lock attempt' : ''}`, () => {
      expect(capacityWarningFor(ruleset, { plannedLoad, capacity, onLockAttempt, daysSinceLastSoftWarning })).toBe(warning);
    });
  }
});

describe('anchorSoftCapWarned', () => {
  const cases: readonly [existing: number, warned: boolean][] = [
    [0, false],
    [2, false],
    [3, true],
    [7, true],
  ];

  for (const [existing, warned] of cases) {
    it(`should ${warned ? 'warn' : 'stay quiet'} while creating an anchor alongside ${existing} others`, () => {
      expect(anchorSoftCapWarned(ruleset, existing)).toBe(warned);
    });
  }
});
