import { describe, expect, it } from 'bun:test';

import {
  addUtcDays,
  isReportableRange,
  lastIncludedInstant,
  MAX_USAGE_RANGE_DAYS,
  parseUsageSearch,
  pickerRangeOf,
  searchRangeOf,
  usageParams,
  usageRangePresets,
  utcToday,
} from '../src/features/usage/usage-search';

describe('parseUsageSearch', () => {
  const now = new Date('2026-10-18T12:00:00Z');

  it('should group by app when nothing is given', () => {
    expect(parseUsageSearch({}, now)).toEqual({ groupBy: 'app' });
  });

  it('should keep calendar dates and a known grouping', () => {
    expect(parseUsageSearch({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' }, now)).toEqual({ from: '2026-09-01', to: '2026-10-01', groupBy: 'model' });
  });

  it('should drop a day that overflows its month', () => {
    expect(parseUsageSearch({ from: '2026-02-30', to: '2026-04-31', groupBy: 'app' }, now)).toEqual({ groupBy: 'app' });
  });

  it('should accept a leap day only in a leap year', () => {
    expect(parseUsageSearch({ from: '2028-02-29', to: '2028-03-01' }, now)).toEqual({ from: '2028-02-29', to: '2028-03-01', groupBy: 'app' });
    expect(parseUsageSearch({ from: '2026-02-29', to: '2026-03-01' }, now)).toEqual({ to: '2026-03-01', groupBy: 'app' });
  });

  it('should drop an empty or inverted range whole', () => {
    expect(parseUsageSearch({ from: '2026-10-01', to: '2026-10-01', groupBy: 'day' }, now)).toEqual({ groupBy: 'day' });
    expect(parseUsageSearch({ from: '2026-10-02', to: '2026-10-01', groupBy: 'day' }, now)).toEqual({ groupBy: 'day' });
  });

  it('should drop malformed dates and an unknown grouping', () => {
    expect(parseUsageSearch({ from: '2026-13-45', to: 'yesterday', groupBy: 'subject' }, now)).toEqual({ groupBy: 'app' });
  });

  it('should keep an open-ended range that starts today', () => {
    expect(parseUsageSearch({ from: '2026-10-18', groupBy: 'day' }, now)).toEqual({ from: '2026-10-18', groupBy: 'day' });
  });

  it('should drop an open-ended range that starts after now', () => {
    expect(parseUsageSearch({ from: '2026-10-19', groupBy: 'day' }, now)).toEqual({ groupBy: 'day' });
  });

  it('should drop an open-ended range that starts exactly at now, since it would be empty', () => {
    expect(parseUsageSearch({ from: '2026-10-18' }, new Date('2026-10-18T00:00:00Z'))).toEqual({ groupBy: 'app' });
  });

  it('should judge an open-ended start against the UTC day, not the local one', () => {
    expect(parseUsageSearch({ from: '2026-10-18' }, new Date('2026-10-17T23:30:00-05:00'))).toEqual({ from: '2026-10-18', groupBy: 'app' });
    expect(parseUsageSearch({ from: '2026-10-19' }, new Date('2026-10-19T02:00:00+05:00'))).toEqual({ groupBy: 'app' });
  });

  it('should leave a future start alone when an explicit end follows it', () => {
    expect(parseUsageSearch({ from: '2026-10-20', to: '2026-10-25' }, now)).toEqual({ from: '2026-10-20', to: '2026-10-25', groupBy: 'app' });
  });

  it('should keep an open-ended range that reaches back less than the cap to now', () => {
    const from = addUtcDays('2026-10-18', 1 - MAX_USAGE_RANGE_DAYS);
    expect(parseUsageSearch({ from }, now)).toEqual({ from, groupBy: 'app' });
  });

  it('should drop an open-ended range that reaches back further than the cap to now', () => {
    expect(parseUsageSearch({ from: addUtcDays('2026-10-18', -MAX_USAGE_RANGE_DAYS), groupBy: 'day' }, now)).toEqual({ groupBy: 'day' });
  });

  it('should keep an open-ended range that spans exactly the cap at midnight', () => {
    const from = addUtcDays('2026-10-18', -MAX_USAGE_RANGE_DAYS);
    expect(parseUsageSearch({ from }, new Date('2026-10-18T00:00:00Z'))).toEqual({ from, groupBy: 'app' });
  });

  it('should keep an explicit range of exactly the cap and drop one a day longer', () => {
    const to = '2026-10-01';
    expect(parseUsageSearch({ from: addUtcDays(to, -MAX_USAGE_RANGE_DAYS), to }, now)).toEqual({ from: addUtcDays(to, -MAX_USAGE_RANGE_DAYS), to, groupBy: 'app' });
    expect(parseUsageSearch({ from: addUtcDays(to, -MAX_USAGE_RANGE_DAYS - 1), to, groupBy: 'model' }, now)).toEqual({ groupBy: 'model' });
  });

  it('should keep an explicit range further back than the cap when its own span fits', () => {
    expect(parseUsageSearch({ from: '2024-01-01', to: '2024-06-01' }, now)).toEqual({ from: '2024-01-01', to: '2024-06-01', groupBy: 'app' });
  });
});

describe('isReportableRange', () => {
  const now = new Date('2026-10-18T12:00:00Z');

  it('should accept a picked range of exactly the cap in whole days', () => {
    expect(isReportableRange('2025-09-14', addUtcDays('2025-09-14', MAX_USAGE_RANGE_DAYS), now)).toBe(true);
  });

  it('should refuse a picked range one whole day over the cap', () => {
    expect(isReportableRange('2025-09-14', addUtcDays('2025-09-14', MAX_USAGE_RANGE_DAYS + 1), now)).toBe(false);
  });

  it('should refuse an empty or inverted range', () => {
    expect(isReportableRange('2026-10-01', '2026-10-01', now)).toBe(false);
    expect(isReportableRange('2026-10-02', '2026-10-01', now)).toBe(false);
  });

  it('should measure an open-ended range up to now', () => {
    expect(isReportableRange('2026-10-18', undefined, now)).toBe(true);
    expect(isReportableRange('2026-10-19', undefined, now)).toBe(false);
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
