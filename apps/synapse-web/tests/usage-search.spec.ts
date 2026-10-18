import { describe, expect, it } from 'bun:test';

import { addUtcDays, lastIncludedInstant, parseUsageSearch, pickerRangeOf, searchRangeOf, usageParams, usageRangePresets, utcToday } from '../src/features/usage/usage-search';

describe('parseUsageSearch', () => {
  it('should group by app when nothing is given', () => {
    expect(parseUsageSearch({})).toEqual({ groupBy: 'app' });
  });

  it('should keep calendar dates and a known grouping', () => {
    expect(parseUsageSearch({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' })).toEqual({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' });
  });

  it('should drop a day that overflows its month', () => {
    expect(parseUsageSearch({ from: '2026-02-30', to: '2026-04-31', groupBy: 'app' })).toEqual({ groupBy: 'app' });
  });

  it('should accept a leap day only in a leap year', () => {
    expect(parseUsageSearch({ from: '2028-02-29' })).toEqual({ from: '2028-02-29', groupBy: 'app' });
    expect(parseUsageSearch({ from: '2026-02-29' })).toEqual({ groupBy: 'app' });
  });

  it('should drop an empty or inverted range whole', () => {
    expect(parseUsageSearch({ from: '2026-10-01', to: '2026-10-01', groupBy: 'day' })).toEqual({ groupBy: 'day' });
    expect(parseUsageSearch({ from: '2026-10-02', to: '2026-10-01', groupBy: 'day' })).toEqual({ groupBy: 'day' });
  });

  it('should drop malformed dates and an unknown grouping', () => {
    expect(parseUsageSearch({ from: '2026-13-45', to: 'yesterday', groupBy: 'subject' })).toEqual({ groupBy: 'app' });
  });
});

describe('usageParams', () => {
  it('should send only the bounds that are set', () => {
    expect(usageParams({ groupBy: 'day', from: '2026-09-01' })).toEqual({ groupBy: 'day', from: '2026-09-01' });
  });
});

describe('addUtcDays', () => {
  it('should cross month, year and leap-day boundaries in UTC', () => {
    expect(addUtcDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addUtcDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addUtcDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('utcToday', () => {
  it('should take the UTC calendar day, not the local one', () => {
    expect(utcToday(new Date('2026-10-17T23:30:00-05:00'))).toBe('2026-10-18');
  });
});

describe('pickerRangeOf', () => {
  it('should show the exclusive end as the last included day', () => {
    expect(pickerRangeOf({ from: '2026-09-01', to: '2026-10-01' })).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('should leave unset bounds empty', () => {
    expect(pickerRangeOf({})).toEqual({ start: null, end: null });
    expect(pickerRangeOf({ from: '2026-09-01' })).toEqual({ start: '2026-09-01', end: null });
  });
});

describe('searchRangeOf', () => {
  it('should store the picked last day as the exclusive day after it', () => {
    expect(searchRangeOf({ start: '2026-09-01', end: '2026-09-30' })).toEqual({ from: '2026-09-01', to: '2026-10-01' });
  });

  it('should send a single picked day as a one-day range', () => {
    expect(searchRangeOf({ start: '2026-10-17', end: '2026-10-17' })).toEqual({ from: '2026-10-17', to: '2026-10-18' });
  });

  it('should keep only the start of a range left open-ended', () => {
    expect(searchRangeOf({ start: '2026-10-01', end: null })).toEqual({ from: '2026-10-01' });
    expect(searchRangeOf({ start: null, end: null })).toEqual({});
  });

  it('should round-trip through the picker unchanged', () => {
    const search = { from: '2026-01-15', to: '2026-03-01' };
    expect(searchRangeOf(pickerRangeOf(search))).toEqual(search);
  });
});

describe('usageRangePresets', () => {
  it('should count today as the last day of every preset', () => {
    expect(usageRangePresets('2026-10-17')).toEqual([
      { label: 'Last 7 days', range: { start: '2026-10-11', end: '2026-10-17' } },
      { label: 'Last 30 days', range: { start: '2026-09-18', end: '2026-10-17' } },
      { label: 'Last 90 days', range: { start: '2026-07-20', end: '2026-10-17' } },
    ]);
  });
});

describe('lastIncludedInstant', () => {
  it('should land a midnight exclusive bound on the day before it', () => {
    expect(lastIncludedInstant('2026-10-18T00:00:00.000Z')).toBe('2026-10-17T23:59:59.999Z');
  });

  it('should keep a default "now" bound on its own day', () => {
    expect(lastIncludedInstant('2026-10-17T14:03:12.000Z')).toBe('2026-10-17T14:03:11.999Z');
  });

  it('should pass an unparseable bound through for the formatter to dash out', () => {
    expect(lastIncludedInstant('soon')).toBe('soon');
  });
});
