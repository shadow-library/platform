import { describe, expect, it } from 'bun:test';

import { budgetAttentionOf } from '../src/features/overview/budget-attention';
import { dailySpendOf, OTHER_SERIES_KEY, UNKNOWN_SERIES_KEY } from '../src/features/overview/daily-spend';
import { featureSpendOf, featureTitle, featureUsageSearch, topFeaturesSubtitle } from '../src/features/overview/feature-spend';
import { changeFrom, lastDays, monthToDate, overviewPeriods } from '../src/features/overview/overview-periods';
import { chartDayFormatter, formatChartDay, formatUsdTick } from '../src/features/shared/chart-format';
import {
  type BudgetStatusEntryResponse,
  type BudgetStatusResponse,
  type UsageRowResponse,
  type UsageSeriesEntryResponse,
  type UsageSeriesResponse,
  type UsageTotalsResponse,
} from '../src/lib/apis/api-types.gen';

const ZERO_TOTALS: UsageTotalsResponse = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, listCostUsd: 0, billedCostUsd: 0 };
const DAYS = ['2026-10-23', '2026-10-24', '2026-10-25'];
const WINDOW = { from: '2026-09-26' };

function entry(key: string | null, daily: readonly [list: number, billed: number][]): UsageSeriesEntryResponse {
  const points = DAYS.map((day, position) => ({ day, calls: 1, listCostUsd: daily[position]?.[0] ?? 0, billedCostUsd: daily[position]?.[1] ?? 0 }));
  const listCostUsd = points.reduce((sum, point) => sum + point.listCostUsd, 0);
  const billedCostUsd = points.reduce((sum, point) => sum + point.billedCostUsd, 0);
  return { key, points, totals: { ...ZERO_TOTALS, calls: points.length, listCostUsd, billedCostUsd } };
}

function seriesResponse(series: UsageSeriesEntryResponse[]): UsageSeriesResponse {
  const listCostUsd = series.reduce((sum, item) => sum + item.totals.listCostUsd, 0);
  const billedCostUsd = series.reduce((sum, item) => sum + item.totals.billedCostUsd, 0);
  return { from: '2026-10-23T00:00:00.000Z', to: '2026-10-25T12:00:00.000Z', groupBy: 'app', days: DAYS, series, totals: { ...ZERO_TOTALS, listCostUsd, billedCostUsd } };
}

function usageRow(key: string | null, listCostUsd: number, billedCostUsd: number): UsageRowResponse {
  return { ...ZERO_TOTALS, key, calls: 1, listCostUsd, billedCostUsd };
}

function budgetEntry(overrides: Partial<BudgetStatusEntryResponse>): BudgetStatusEntryResponse {
  return {
    index: 0,
    app: 'novel-forge',
    per: 'app',
    window: '1h',
    maxListCostUsd: 50,
    windowStart: '2026-10-25T14:00:00.000Z',
    windowEnd: '2026-10-25T15:00:00.000Z',
    usage: { kind: 'app', calls: 0, listCostUsd: 0 },
    ...overrides,
  };
}

const budgetStatus = (budgets: BudgetStatusEntryResponse[]): BudgetStatusResponse => ({ catalogVersion: 3, budgets });

describe('monthToDate', () => {
  it('should compare mid-month spend with the same elapsed time of last month, to the minute', () => {
    const month = monthToDate(new Date('2026-10-25T14:35:42.000Z'));
    expect(month.current).toEqual({ from: '2026-10-01' });
    expect(month.previous).toEqual({ from: '2026-09-01', to: '2026-09-25T14:35:00.000Z' });
    expect(month.comparison).toBe('same time in September');
  });

  it('should have no comparison in the first hour of a month', () => {
    expect(monthToDate(new Date('2026-11-01T00:40:00.000Z'))).toEqual({ current: { from: '2026-11-01' }, previous: null, comparison: null });
  });

  it('should compare hours with hours later on the 1st', () => {
    expect(monthToDate(new Date('2026-11-01T01:59:00.000Z')).previous).toEqual({ from: '2026-10-01', to: '2026-10-01T01:59:00.000Z' });
  });

  it('should compare with the whole previous month when this month has run longer', () => {
    const month = monthToDate(new Date('2026-03-30T08:00:00.000Z'));
    expect(month.previous).toEqual({ from: '2026-02-01', to: '2026-03-01' });
    expect(month.comparison).toBe('all of February');
  });

  it('should reach back into the previous year in January', () => {
    expect(monthToDate(new Date('2027-01-10T00:00:00.000Z')).previous).toEqual({ from: '2026-12-01', to: '2026-12-10T00:00:00.000Z' });
  });
});

describe('overviewPeriods', () => {
  it('should carry the UTC day and the month-to-date windows', () => {
    const periods = overviewPeriods(new Date('2026-10-25T23:59:00.000Z'));
    expect(periods.today).toBe('2026-10-25');
    expect(periods.month.current.from).toBe('2026-10-01');
  });
});

describe('lastDays', () => {
  it('should start the window so that it holds today and the days before it', () => {
    expect(lastDays('2026-10-25', 30)).toEqual({ from: '2026-09-26' });
    expect(lastDays('2026-10-25', 90)).toEqual({ from: '2026-07-28' });
  });
});

describe('changeFrom', () => {
  it('should give the signed fraction of change', () => {
    expect(changeFrom(150, 100)).toBe(0.5);
    expect(changeFrom(50, 100)).toBe(-0.5);
  });

  it('should leave the change out without a baseline to compare with', () => {
    expect(changeFrom(10, 0)).toBeUndefined();
    expect(changeFrom(0, 0)).toBeUndefined();
    expect(changeFrom(10, undefined)).toBeUndefined();
    expect(changeFrom(undefined, 10)).toBeUndefined();
  });
});

describe('dailySpendOf', () => {
  it('should order series by key so colours stay with their app', () => {
    const spend = dailySpendOf(seriesResponse([entry('web-novel', [[9, 1]]), entry('memoir', [[1, 1]]), entry(null, [[5, 0]])]), 'list');
    expect(spend.series).toEqual([
      { key: 'memoir', label: 'Memoir', slot: 1 },
      { key: 'web-novel', label: 'Web Novel', slot: 2 },
      { key: UNKNOWN_SERIES_KEY, label: 'Unknown app', slot: 3 },
    ]);
  });

  it('should keep an app on its slot when another app is folded away', () => {
    const apps = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii'];
    const full = dailySpendOf(seriesResponse(apps.map((key, position) => entry(key, [[100 - position, 1]]))), 'list');
    const slotOf = (spend: typeof full, key: string): number | undefined => spend.series.find(item => item.key === key)?.slot;
    expect(slotOf(full, 'aa')).toBe(1);
    expect(slotOf(full, 'gg')).toBe(7);
    expect(full.series.find(item => item.key === OTHER_SERIES_KEY)?.slot).toBeUndefined();
    const fewer = dailySpendOf(seriesResponse(apps.slice(0, 3).map(key => entry(key, [[1, 1]]))), 'list');
    expect(slotOf(fewer, 'cc')).toBe(3);
  });

  it('should chart the chosen cost per day, one datum for every day', () => {
    const response = seriesResponse([
      entry('memoir', [
        [1, 0.5],
        [0, 0],
        [2, 1],
      ]),
    ]);
    expect(dailySpendOf(response, 'billed').data).toEqual([
      { x: '2026-10-23', values: { memoir: 0.5 } },
      { x: '2026-10-24', values: { memoir: 0 } },
      { x: '2026-10-25', values: { memoir: 1 } },
    ]);
    expect(dailySpendOf(response, 'list').data.map(datum => datum.values.memoir)).toEqual([1, 0, 2]);
    expect(dailySpendOf(response, 'billed').total).toBe(1.5);
  });

  it('should fold everything past the top seven into a neutral other series when there are more than eight', () => {
    const series = Array.from({ length: 10 }, (_, position) => entry(`app-${String(position).padStart(2, '0')}`, [[100 - position, 1]]));
    const spend = dailySpendOf(seriesResponse(series), 'list');
    expect(spend.series).toHaveLength(8);
    expect(spend.series.at(-1)).toEqual({ key: OTHER_SERIES_KEY, label: '3 other apps', tone: 'neutral' });
    expect(spend.data[0]?.values[OTHER_SERIES_KEY]).toBe(93 + 92 + 91);
  });

  it('should chart an app keyed like a prototype key as its own value', () => {
    const data = dailySpendOf(seriesResponse([entry('__proto__', [[1, 3]]), entry('constructor', [[2, 4]])]), 'billed').data;
    expect(data[0]?.values).toEqual(JSON.parse('{"__proto__":3,"constructor":4}'));
    expect(Object.getPrototypeOf(data[0]?.values)).toBe(Object.prototype);
  });

  it('should keep eight series without folding', () => {
    const series = Array.from({ length: 8 }, (_, position) => entry(`app-${position}`, [[1, 1]]));
    expect(dailySpendOf(seriesResponse(series), 'list').series.some(item => item.key === OTHER_SERIES_KEY)).toBe(false);
  });

  it('should have no series when nothing was called', () => {
    expect(dailySpendOf(seriesResponse([]), 'billed')).toEqual({ data: DAYS.map(day => ({ x: day, values: {} })), series: [], total: 0 });
  });
});

describe('formatChartDay', () => {
  it('should print a UTC day as a short month and day', () => {
    expect(formatChartDay('2026-10-24')).toBe('Oct 24');
    expect(formatChartDay('not-a-day')).toBe('not-a-day');
  });
});

describe('chartDayFormatter', () => {
  it('should mark only the current UTC day as partial', () => {
    const format = chartDayFormatter('2026-10-25');
    expect(format('2026-10-25')).toBe('Oct 25 (so far)');
    expect(format('2026-10-24')).toBe('Oct 24');
  });

  it('should mark nothing while the day is not known', () => {
    expect(chartDayFormatter(null)('2026-10-25')).toBe('Oct 25');
  });
});

describe('formatUsdTick', () => {
  it('should compact thousands and keep small ticks distinct', () => {
    expect(formatUsdTick(1200)).toBe('$1.2K');
    expect(formatUsdTick(0)).toBe('$0');
    expect(formatUsdTick(12.5)).toBe('$12.5');
    expect(formatUsdTick(0.05)).toBe('$0.05');
    expect(formatUsdTick(0.0012)).toBe('$0.0012');
  });
});

describe('featureTitle', () => {
  const tasks = new Map([['novel-forge.chat', { key: 'novel-forge.chat', app: 'novel-forge', name: 'chat', label: 'Story chat' }]]);

  it('should use the catalog label for a known task', () => {
    expect(featureTitle('novel-forge.chat', tasks)).toBe('Novel Forge · Story chat');
  });

  it('should humanise a task the catalog lacks and keep an unreadable key as it is', () => {
    expect(featureTitle('memoir.daily_summary', tasks)).toBe('Memoir · Daily summary');
    expect(featureTitle('orphan', tasks)).toBe('orphan');
  });
});

describe('featureUsageSearch', () => {
  it('should filter the usage report to the task and its app', () => {
    expect(featureUsageSearch('novel-forge.chat', WINDOW)).toEqual({ groupBy: 'task', from: '2026-09-26', app: 'novel-forge', task: 'novel-forge.chat' });
    expect(featureUsageSearch('orphan', { from: '2026-09-01', to: '2026-10-01' })).toEqual({ groupBy: 'task', from: '2026-09-01', to: '2026-10-01', task: 'orphan' });
  });

  it('should open the Usage screen on API-price when that is what the ranking used', () => {
    expect(featureUsageSearch('memoir.chat', WINDOW, 'list')).toEqual({ groupBy: 'task', from: '2026-09-26', app: 'memoir', task: 'memoir.chat', basis: 'list' });
    expect(featureSpendOf([usageRow('memoir.chat', 1, 0)], [], WINDOW).rows[0]?.usage?.basis).toBe('list');
  });
});

describe('topFeaturesSubtitle', () => {
  it('should explain the API-price ranking only when there were calls but nothing was billed', () => {
    expect(topFeaturesSubtitle(null, 30)).toBe('Last 30 days.');
    expect(topFeaturesSubtitle(featureSpendOf([], [], WINDOW), 30)).toBe('Last 30 days.');
    expect(topFeaturesSubtitle(featureSpendOf([usageRow('memoir.chat', 1, 0)], [], WINDOW), 30)).toBe('Last 30 days, ranked by API-price cost, since nothing was billed.');
    expect(topFeaturesSubtitle(featureSpendOf([usageRow('memoir.chat', 1, 1)], [], WINDOW), 30)).toBe('Last 30 days, ranked by billed spend.');
  });
});

describe('featureSpendOf', () => {
  it('should rank by billed spend with each row’s share of the whole', () => {
    const spend = featureSpendOf([usageRow('memoir.chat', 5, 1), usageRow('novel-forge.chat', 2, 3)], [], WINDOW);
    expect(spend.basis).toBe('billed');
    expect(spend.rows.map(row => [row.id, row.share])).toEqual([
      ['novel-forge.chat', 0.75],
      ['memoir.chat', 0.25],
    ]);
    expect(spend.rows[0]?.usage).toEqual({ groupBy: 'task', from: '2026-09-26', app: 'novel-forge', task: 'novel-forge.chat' });
  });

  it('should rank by API-price cost when nothing was billed', () => {
    const spend = featureSpendOf([usageRow('memoir.chat', 1, 0), usageRow('novel-forge.chat', 3, 0)], [], WINDOW);
    expect(spend.basis).toBe('list');
    expect(spend.rows.map(row => [row.id, row.share])).toEqual([
      ['novel-forge.chat', 0.75],
      ['memoir.chat', 0.25],
    ]);
  });

  it('should keep the top rows while sharing against every row', () => {
    const spend = featureSpendOf([usageRow('a.x', 0, 1), usageRow('b.x', 0, 1), usageRow('c.x', 0, 2)], [], WINDOW, 2);
    expect(spend.rows.map(row => [row.id, row.share])).toEqual([
      ['c.x', 0.5],
      ['a.x', 0.25],
    ]);
  });

  it('should name spend recorded without a task and offer no link for it', () => {
    const [row] = featureSpendOf([usageRow(null, 1, 1)], [], WINDOW).rows;
    expect(row).toEqual({ id: '~unknown', title: 'Unknown feature', billedCostUsd: 1, listCostUsd: 1, share: 1 });
  });
});

describe('budgetAttentionOf', () => {
  it('should list budgets at their limit before those near it', () => {
    const summary = budgetAttentionOf(
      budgetStatus([
        budgetEntry({ index: 0, usage: { kind: 'app', calls: 10, listCostUsd: 10 } }),
        budgetEntry({ index: 1, window: '1d', usage: { kind: 'app', calls: 10, listCostUsd: 42 } }),
        budgetEntry({ index: 2, window: '30d', maxCalls: 100, usage: { kind: 'app', calls: 100, listCostUsd: 1 } }),
      ]),
    );
    expect(summary.total).toBe(3);
    expect(summary.items).toEqual([
      { index: 2, title: 'Novel Forge — whole app — per 30 days', level: 'at', detail: '100 of 100 calls (100%)' },
      { index: 1, title: 'Novel Forge — whole app — per day', level: 'near', detail: 'API-price cost $42.00 of $50.00 (84%)' },
    ]);
  });

  it('should describe a per-user budget by its users', () => {
    const summary = budgetAttentionOf(
      budgetStatus([
        budgetEntry({ per: 'subject', usage: { kind: 'subject', activeSubjects: 3, atLimit: 1, top: [{ subjectType: 'user', subjectId: 'u1', calls: 4, listCostUsd: 50 }] } }),
      ]),
    );
    expect(summary.items[0]).toEqual({
      index: 0,
      title: 'Novel Forge — each user — per hour',
      level: 'at',
      detail: '3 users active this hour · 1 at its limit · highest $50.00 of $50.00',
    });
  });

  it('should list nothing when every budget is clear', () => {
    expect(budgetAttentionOf(budgetStatus([budgetEntry({})]))).toEqual({ total: 1, items: [] });
    expect(budgetAttentionOf(budgetStatus([]))).toEqual({ total: 0, items: [] });
  });
});
