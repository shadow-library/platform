import { describe, expect, it } from 'bun:test';

import { type TaskEntry } from '../src/features/catalog/catalog-spec.types';
import {
  addUtcDays,
  costBasisOf,
  filterApps,
  filterTasks,
  isReportableRange,
  lastIncludedInstant,
  MAX_USAGE_RANGE_DAYS,
  parseUsageSearch,
  pickerRangeOf,
  searchRangeOf,
  usageParams,
  usagePeriodText,
  usageRangePresets,
  utcToday,
  withApp,
  withBasis,
  withRange,
  withTask,
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
    expect(parseUsageSearch({ from: '2026-10-01', to: '2026-10-01', groupBy: 'task' }, now)).toEqual({ groupBy: 'task' });
    expect(parseUsageSearch({ from: '2026-10-02', to: '2026-10-01', groupBy: 'task' }, now)).toEqual({ groupBy: 'task' });
  });

  it('should read an old day grouping as grouping by app', () => {
    expect(parseUsageSearch({ from: '2026-09-01', to: '2026-10-01', groupBy: 'day' }, now)).toEqual({ from: '2026-09-01', to: '2026-10-01', groupBy: 'app' });
  });

  it('should keep the app and feature filters the server accepts', () => {
    expect(parseUsageSearch({ app: 'novel-forge', task: 'novel-forge.chat', groupBy: 'model' }, now)).toEqual({ app: 'novel-forge', task: 'novel-forge.chat', groupBy: 'model' });
  });

  it('should keep a feature link that names no app', () => {
    expect(parseUsageSearch({ groupBy: 'task', task: 'memoir.reflect' }, now)).toEqual({ task: 'memoir.reflect', groupBy: 'task' });
  });

  it('should drop filters the server would refuse', () => {
    expect(parseUsageSearch({ app: 'novel forge', task: 'x'.repeat(65) }, now)).toEqual({ groupBy: 'app' });
    expect(parseUsageSearch({ app: ['memoir'], task: 42 }, now)).toEqual({ groupBy: 'app' });
    expect(parseUsageSearch({ app: '' }, now)).toEqual({ groupBy: 'app' });
  });

  it('should drop an app that contradicts the feature, keeping the feature', () => {
    expect(parseUsageSearch({ app: 'memoir', task: 'novel-forge.chat' }, now)).toEqual({ task: 'novel-forge.chat', groupBy: 'app' });
  });

  it('should keep the filters when it drops an invalid range', () => {
    expect(parseUsageSearch({ from: '2026-10-02', to: '2026-10-01', app: 'memoir' }, now)).toEqual({ app: 'memoir', groupBy: 'app' });
  });

  it('should drop malformed dates and an unknown grouping', () => {
    expect(parseUsageSearch({ from: '2026-13-45', to: 'yesterday', groupBy: 'subject' }, now)).toEqual({ groupBy: 'app' });
  });

  it('should keep an open-ended range that starts today', () => {
    expect(parseUsageSearch({ from: '2026-10-18', groupBy: 'provider' }, now)).toEqual({ from: '2026-10-18', groupBy: 'provider' });
  });

  it('should drop an open-ended range that starts after now', () => {
    expect(parseUsageSearch({ from: '2026-10-19', groupBy: 'provider' }, now)).toEqual({ groupBy: 'provider' });
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
    expect(parseUsageSearch({ from: addUtcDays('2026-10-18', -MAX_USAGE_RANGE_DAYS), groupBy: 'alias' }, now)).toEqual({ groupBy: 'alias' });
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
  it('should send only the bounds and filters that are set', () => {
    expect(usageParams({ groupBy: 'task', from: '2026-09-01' })).toEqual({ groupBy: 'task', from: '2026-09-01' });
    expect(usageParams({ groupBy: 'model', app: 'memoir', task: 'memoir.reflect' })).toEqual({ groupBy: 'model', app: 'memoir', task: 'memoir.reflect' });
  });
});

describe('withApp', () => {
  it('should keep a feature of the chosen app', () => {
    expect(withApp({ groupBy: 'task', task: 'memoir.reflect' }, 'memoir')).toEqual({ groupBy: 'task', app: 'memoir', task: 'memoir.reflect' });
  });

  it('should clear a feature of another app', () => {
    expect(withApp({ groupBy: 'task', from: '2026-09-01', task: 'memoir.reflect' }, 'novel-forge')).toEqual({ groupBy: 'task', from: '2026-09-01', app: 'novel-forge' });
  });

  it('should keep the feature when the app filter is cleared', () => {
    expect(withApp({ groupBy: 'app', app: 'memoir', task: 'memoir.reflect' }, undefined)).toEqual({ groupBy: 'app', task: 'memoir.reflect' });
  });
});

describe('withTask', () => {
  it('should set and clear the feature, leaving the rest', () => {
    expect(withTask({ groupBy: 'app', app: 'memoir' }, 'memoir.reflect')).toEqual({ groupBy: 'app', app: 'memoir', task: 'memoir.reflect' });
    expect(withTask({ groupBy: 'app', app: 'memoir', task: 'memoir.reflect' }, undefined)).toEqual({ groupBy: 'app', app: 'memoir' });
  });
});

describe('withRange', () => {
  it('should replace the range and keep the filters', () => {
    expect(withRange({ groupBy: 'model', from: '2026-09-01', to: '2026-10-01', app: 'memoir' }, { from: '2026-10-01' })).toEqual({
      groupBy: 'model',
      app: 'memoir',
      from: '2026-10-01',
    });
    expect(withRange({ groupBy: 'model', from: '2026-09-01', to: '2026-10-01' }, {})).toEqual({ groupBy: 'model' });
  });
});

describe('filter options', () => {
  const task = (key: string, label?: string): TaskEntry => {
    const [app = '', name = ''] = key.split('.');
    return { key, app, name, ...(label && { label }), kind: 'chat', requires: [], dataPolicy: 'any', aliases: [], pinned: false, routes: [] };
  };
  const tasks = [task('novel-forge.chat'), task('memoir.reflect', 'Daily reflection'), task('novel-forge.outline')];

  it('should list each app once, sorted', () => {
    expect(filterApps(tasks, undefined)).toEqual(['memoir', 'novel-forge']);
  });

  it('should still list a chosen app the catalog no longer has', () => {
    expect(filterApps(tasks, 'pulse')).toEqual(['memoir', 'novel-forge', 'pulse']);
  });

  it('should narrow features to the chosen app, sorted by readable name', () => {
    expect(filterTasks(tasks, 'novel-forge', undefined)).toEqual([
      { key: 'novel-forge.chat', title: 'Novel Forge · Chat' },
      { key: 'novel-forge.outline', title: 'Novel Forge · Outline' },
    ]);
  });

  it('should list every feature when no app is chosen', () => {
    expect(filterTasks(tasks, undefined, undefined).map(option => option.key)).toEqual(['memoir.reflect', 'novel-forge.chat', 'novel-forge.outline']);
  });

  it('should still list a chosen feature the catalog no longer has', () => {
    expect(filterTasks(tasks, 'novel-forge', 'novel-forge.retired-thing')).toContainEqual({ key: 'novel-forge.retired-thing', title: 'Novel Forge · Retired thing' });
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
    expect(pickerRangeOf({ from: '2026-09-01', to: '2026-10-01' }, '2026-10-25')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it("should end a range left open on the report's own last day, and leave it open until the report arrives", () => {
    expect(pickerRangeOf({ from: '2026-09-26' }, '2026-10-25')).toEqual({ start: '2026-09-26', end: '2026-10-25' });
    expect(pickerRangeOf({ from: '2026-09-26' }, null)).toEqual({ start: '2026-09-26', end: null });
  });

  it('should leave the default range empty', () => {
    expect(pickerRangeOf({}, '2026-10-25')).toEqual({ start: null, end: null });
  });
});

describe('usagePeriodText', () => {
  it('should name today for a report that runs to now or to tonight', () => {
    expect(usagePeriodText({ from: '2026-09-26T00:00:00.000Z', to: '2026-10-25T14:03:12.000Z' }, '2026-10-25')).toBe('Sep 26, 2026 – today');
    expect(usagePeriodText({ from: '2026-09-26T00:00:00.000Z', to: '2026-10-26T00:00:00.000Z' }, '2026-10-25')).toBe('Sep 26, 2026 – today');
  });

  it('should print both days, unpadded, for a range that ended earlier', () => {
    expect(usagePeriodText({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' }, '2026-10-25')).toBe('Sep 1, 2026 – Sep 30, 2026');
  });

  it('should print the date until the clock is read after hydration', () => {
    expect(usagePeriodText({ from: '2026-09-26T00:00:00.000Z', to: '2026-10-25T14:03:12.000Z' }, null)).toBe('Sep 26, 2026 – Oct 25, 2026');
  });
});

describe('cost basis', () => {
  it('should read API-price from the URL and default anything else to billed', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    expect(parseUsageSearch({ basis: 'list', groupBy: 'task' }, now)).toEqual({ groupBy: 'task', basis: 'list' });
    for (const basis of ['billed', 'LIST', 'constructor', 1, undefined]) expect(parseUsageSearch({ basis }, now)).toEqual({ groupBy: 'app' });
    expect(costBasisOf({})).toBe('billed');
    expect(costBasisOf({ basis: 'list' })).toBe('list');
  });

  it('should keep billed out of the URL and the other filters in it', () => {
    const search = { groupBy: 'model' as const, from: '2026-09-01', app: 'memoir' };
    expect(withBasis(search, 'list')).toEqual({ ...search, basis: 'list' });
    expect(withBasis({ ...search, basis: 'list' }, 'billed')).toEqual(search);
  });

  it('should not send the basis to the server, which reports both costs', () => {
    expect(usageParams({ groupBy: 'app', basis: 'list' })).toEqual({ groupBy: 'app' });
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
    expect(searchRangeOf(pickerRangeOf(search, '2026-10-25'))).toEqual(search);
  });
});

describe('usageRangePresets', () => {
  it('should offer rolling windows ending today and the UTC calendar months', () => {
    expect(usageRangePresets('2026-10-17')).toEqual([
      { label: 'Last 7 days', range: { start: '2026-10-11', end: '2026-10-17' } },
      { label: 'Last 30 days', range: { start: '2026-09-18', end: '2026-10-17' } },
      { label: 'Last 90 days', range: { start: '2026-07-20', end: '2026-10-17' } },
      { label: 'This month', range: { start: '2026-10-01', end: '2026-10-17' } },
      { label: 'Last month', range: { start: '2026-09-01', end: '2026-09-30' } },
    ]);
  });

  it('should make this month a single day on the first', () => {
    expect(usageRangePresets('2026-10-01').find(preset => preset.label === 'This month')?.range).toEqual({ start: '2026-10-01', end: '2026-10-01' });
  });

  it('should reach back into the previous year in January and end on a leap day', () => {
    expect(usageRangePresets('2027-01-15').find(preset => preset.label === 'Last month')?.range).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(usageRangePresets('2028-03-05').find(preset => preset.label === 'Last month')?.range).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('should store last month as a range the server accepts', () => {
    const range = usageRangePresets('2026-10-17').find(preset => preset.label === 'Last month')?.range;
    expect(range && searchRangeOf(range)).toEqual({ from: '2026-09-01', to: '2026-10-01' });
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

describe('parseUsageSearch with prototype keys', () => {
  it('should group by app when the grouping names a prototype key', () => {
    for (const groupBy of ['constructor', '__proto__', 'toString']) expect(parseUsageSearch({ groupBy }, new Date('2026-10-25T12:00:00Z')).groupBy).toBe('app');
  });
});
