import { describe, expect, it } from 'bun:test';

import { MAX_SLEEP_MINUTES, MIN_SLEEP_MINUTES, minutesUntilSleep, sleepMinutesBetween, sleepWindowProblem } from '@/lib/data/sleep-window.rules';

const at = (hours: number, minutes = 0): number => hours * 60 + minutes;

describe('sleepMinutesBetween', () => {
  it('should count sleeping at midnight and waking at seven as seven hours', () => {
    expect(sleepMinutesBetween('07:00', '00:00')).toBe(at(7));
  });

  it('should wrap a sleep time before midnight into the next morning', () => {
    expect(sleepMinutesBetween('06:30', '22:30')).toBe(at(8));
  });

  it('should count a day-time sleeper the same way', () => {
    expect(sleepMinutesBetween('15:00', '07:00')).toBe(at(8));
  });
});

describe('sleepWindowProblem', () => {
  it('should accept a sleep time after midnight', () => {
    expect(sleepWindowProblem('07:00', '00:00')).toBeNull();
    expect(sleepWindowProblem('07:00', '01:30')).toBeNull();
  });

  it('should accept the bounds themselves', () => {
    expect(sleepWindowProblem('07:00', '04:00')).toBeNull();
    expect(sleepWindowProblem('07:00', '17:00')).toBeNull();
    expect(MIN_SLEEP_MINUTES).toBe(at(3));
    expect(MAX_SLEEP_MINUTES).toBe(at(14));
  });

  it('should refuse identical times, too little sleep and too much sleep', () => {
    expect(sleepWindowProblem('07:00', '07:00')).toBe('Sleep and wake time can’t be the same.');
    expect(sleepWindowProblem('07:00', '04:30')).toBe('That leaves 2h 30m of sleep. Allow at least 3h.');
    expect(sleepWindowProblem('07:00', '16:30')).toBe('That’s 14h 30m of sleep. Allow at most 14h.');
  });
});

describe('minutesUntilSleep', () => {
  it('should count down to a sleep time later the same day', () => {
    expect(minutesUntilSleep(at(20), at(6, 30), at(22, 30))).toBe(at(2, 30));
    expect(minutesUntilSleep(at(23), at(6, 30), at(22, 30))).toBeLessThan(0);
  });

  it('should keep the window open past midnight for a sleep time after midnight', () => {
    expect(minutesUntilSleep(at(22), at(7), at(0, 30))).toBe(at(2, 30));
    expect(minutesUntilSleep(at(0, 10), at(7), at(0, 30))).toBe(20);
  });
});
