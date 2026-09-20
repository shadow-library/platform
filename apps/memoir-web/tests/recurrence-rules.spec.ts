import { describe, expect, it } from 'vitest';

import { nextOccurrenceAfter, occursOn, type Recurrence } from '@/lib/data';

function rule(partial: Partial<Recurrence>): Recurrence {
  return { frequency: 'daily', interval: 1, daysOfWeek: [], dayOfMonth: null, startDate: '2026-01-01', end: { kind: 'never' }, exceptions: [], ...partial };
}

function datesIn(recurrence: Recurrence, from: string, days: number): string[] {
  const dates: string[] = [];
  for (let date = from, index = 0; index < days; index += 1) {
    if (occursOn(recurrence, date)) dates.push(date);
    date = nextDay(date);
  }
  return dates;
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

describe('occursOn', () => {
  it('should count an every-N-days quest from its start date', () => {
    expect(datesIn(rule({ interval: 3, startDate: '2026-08-20' }), '2026-08-18', 10)).toEqual(['2026-08-20', '2026-08-23', '2026-08-26']);
  });

  it('should skip the off weeks of a fortnightly quest counted from its start week', () => {
    const fortnightly = rule({ frequency: 'weekly', interval: 2, daysOfWeek: ['mon', 'thu'], startDate: '2026-08-19' });

    expect(datesIn(fortnightly, '2026-08-17', 21)).toEqual(['2026-08-20', '2026-08-31', '2026-09-03']);
  });

  it('should land on the last weekday of each month', () => {
    const lastFriday = rule({ frequency: 'monthly', nthWeekday: { weekday: 'fri', ordinal: 'last' } });

    expect(datesIn(lastFriday, '2026-01-01', 120)).toEqual(['2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24']);
  });

  it('should land on the fourth weekday even in a short month', () => {
    expect(occursOn(rule({ frequency: 'monthly', nthWeekday: { weekday: 'mon', ordinal: 4 } }), '2026-02-23')).toBe(true);
    expect(occursOn(rule({ frequency: 'monthly', nthWeekday: { weekday: 'mon', ordinal: 4 } }), '2026-02-16')).toBe(false);
  });

  it('should clamp a day of the month past the month end to its last day', () => {
    const thirtyFirst = rule({ frequency: 'monthly', dayOfMonth: 31 });

    expect(occursOn(thirtyFirst, '2026-02-28')).toBe(true);
    expect(occursOn(thirtyFirst, '2026-03-31')).toBe(true);
    expect(occursOn(thirtyFirst, '2026-03-28')).toBe(false);
  });

  it('should let an exception use up a slot of a counted series', () => {
    const three = rule({ startDate: '2026-08-20', end: { kind: 'count', count: 3 }, exceptions: ['2026-08-21'] });

    expect(datesIn(three, '2026-08-19', 6)).toEqual(['2026-08-20', '2026-08-22']);
  });

  it('should stop after an until date and never run before the start date', () => {
    const bounded = rule({ startDate: '2026-08-20', end: { kind: 'until', date: '2026-08-21' } });

    expect(datesIn(bounded, '2026-08-19', 4)).toEqual(['2026-08-20', '2026-08-21']);
  });
});

describe('nextOccurrenceAfter', () => {
  it('should find the next occurrence beyond the current week', () => {
    expect(nextOccurrenceAfter(rule({ frequency: 'monthly', nthWeekday: { weekday: 'fri', ordinal: 'last' } }), '2026-09-13')).toBe('2026-09-25');
  });

  it('should find nothing once a series has ended', () => {
    expect(nextOccurrenceAfter(rule({ end: { kind: 'until', date: '2026-09-13' } }), '2026-09-13')).toBeNull();
  });

  it('should stop at an exhausted count or a passed until date instead of probing the whole horizon', () => {
    const exhausted = rule({ startDate: '2020-01-01', end: { kind: 'count', count: 2000 } });
    const ended = rule({ startDate: '2020-01-01', end: { kind: 'until', date: '2021-01-01' } });

    expect(nextOccurrenceAfter(exhausted, '2026-09-13', Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(nextOccurrenceAfter(ended, '2026-09-13', Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it('should honour the slots left in a counted series, with an exception using one up', () => {
    const three = rule({ startDate: '2026-09-10', end: { kind: 'count', count: 3 }, exceptions: ['2026-09-11'] });

    expect(nextOccurrenceAfter(three, '2026-09-10')).toBe('2026-09-12');
    expect(nextOccurrenceAfter(three, '2026-09-12')).toBeNull();
    expect(nextOccurrenceAfter(rule({ startDate: '2026-09-20' }), '2026-09-13')).toBe('2026-09-20');
  });
});
