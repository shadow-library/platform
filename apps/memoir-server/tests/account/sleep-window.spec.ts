import { describe, expect, it } from 'bun:test';

import { isSleepWindowValid, MAX_SLEEP_MINUTES, MIN_SLEEP_MINUTES, sleepMinutes } from '@modules/account/sleep-window';

const at = (hours: number, minutes = 0): number => hours * 60 + minutes;

describe('sleepMinutes', () => {
  it('should count a sleep time after midnight as the same night', () => {
    expect(sleepMinutes(at(7), at(0))).toBe(at(7));
    expect(sleepMinutes(at(7), at(0, 30))).toBe(at(6, 30));
  });

  it('should wrap a sleep time before midnight into the next morning', () => {
    expect(sleepMinutes(at(6, 30), at(22, 30))).toBe(at(8));
  });

  it('should treat a sleep time later in the morning than waking as a day-time sleeper', () => {
    expect(sleepMinutes(at(15), at(7))).toBe(at(8));
  });

  it('should report no sleep when both times are the same', () => {
    expect(sleepMinutes(at(7), at(7))).toBe(0);
  });
});

describe('isSleepWindowValid', () => {
  it('should accept the bounds themselves', () => {
    expect(isSleepWindowValid(at(7), at(7) - MIN_SLEEP_MINUTES)).toBe(true);
    expect(isSleepWindowValid(at(7), at(7) - MAX_SLEEP_MINUTES + 1440)).toBe(true);
  });

  it('should reject identical times, too little sleep and too much sleep', () => {
    expect(isSleepWindowValid(at(7), at(7))).toBe(false);
    expect(isSleepWindowValid(at(7), at(7) - MIN_SLEEP_MINUTES + 1)).toBe(false);
    expect(isSleepWindowValid(at(7), at(7) - MAX_SLEEP_MINUTES + 1440 - 1)).toBe(false);
  });

  it('should accept the onboarding that failed in dev, sleeping at midnight and waking at seven', () => {
    expect(isSleepWindowValid(at(7), at(0))).toBe(true);
  });
});
