import { describe, expect, it } from 'bun:test';

import { csvField, toCsv, usageCsv, usageCsvFilename } from '../src/features/usage/usage-csv';
import {
  comparisonLabel,
  EMPTY_NAMES,
  formatPerCall,
  formatShortDay,
  formatUsdTick,
  NOT_RECORDED,
  OTHER_SERIES_KEY,
  previousPeriod,
  totalsDeltas,
  UNRECORDED_SERIES_KEY,
  usageChart,
  usageKeyName,
  usageNamesOf,
  usageRows,
  usageSlotKeys,
} from '../src/features/usage/usage-report';
import { type UsageRowResponse, type UsageSeriesEntryResponse, type UsageTotalsResponse } from '../src/lib/apis/api-types.gen';

const totals = (listCostUsd: number, billedCostUsd = 0, calls = 1): UsageTotalsResponse => ({
  calls,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  listCostUsd,
  billedCostUsd,
});

const row = (key: string | null, listCostUsd: number, billedCostUsd = 0, calls = 1): UsageRowResponse => ({ key, ...totals(listCostUsd, billedCostUsd, calls) });

const DAYS = ['2026-10-01', '2026-10-02'];

function entry(key: string | null, perDay: readonly number[]): UsageSeriesEntryResponse {
  const points = DAYS.map((day, index) => ({ day, calls: 1, listCostUsd: perDay[index] ?? 0, billedCostUsd: 0 }));
  return { key, points, totals: totals(perDay.reduce((sum, value) => sum + value, 0)) };
}

const nameOf = (key: string | null): string => key ?? NOT_RECORDED;

describe('usageChart', () => {
  it('should keep the seven costliest series and fold the rest into a neutral Other', () => {
    const series = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((key, index) => entry(key, [10 - index, 1]));
    const chart = usageChart({ days: DAYS, series }, 'list', nameOf);
    expect(chart.series.map(item => item.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', OTHER_SERIES_KEY]);
    expect(chart.series.at(-1)).toEqual({ key: OTHER_SERIES_KEY, label: 'Other (2)', tone: 'neutral' });
    expect(chart.data[0]?.values[OTHER_SERIES_KEY]).toBe(3 + 2);
    expect(chart.data[1]?.values[OTHER_SERIES_KEY]).toBe(2);
  });

  it('should add no Other when every series fits', () => {
    const chart = usageChart({ days: DAYS, series: [entry('a', [1, 2]), entry('b', [3, 0])] }, 'list', nameOf);
    expect(chart.series.map(item => item.key)).toEqual(['a', 'b']);
  });

  it('should order kept series by key so a colour follows the entity, not its rank', () => {
    const before = usageChart({ days: DAYS, series: [entry('zeta', [9, 0]), entry('alpha', [1, 0])] }, 'list', nameOf);
    const after = usageChart({ days: DAYS, series: [entry('alpha', [9, 0]), entry('zeta', [1, 0])] }, 'list', nameOf);
    expect(before.series.map(item => item.key)).toEqual(['alpha', 'zeta']);
    expect(after.series.map(item => item.key)).toEqual(['alpha', 'zeta']);
  });

  it('should keep a series on its slot when a cost basis drops a series or a key falls out of the kept set', () => {
    const series = [entry('a', [9, 0]), { ...entry('b', [0, 0]) }, entry('c', [1, 0])];
    const slotsOf = (chart: ReturnType<typeof usageChart>): Record<string, number | undefined> => Object.fromEntries(chart.series.map(item => [item.key, item.slot]));
    expect(slotsOf(usageChart({ days: DAYS, series }, 'list', nameOf))).toEqual({ a: 1, c: 3 });
    expect(slotsOf(usageChart({ days: DAYS, series }, 'list', nameOf, 1))).toEqual({ a: 1, [OTHER_SERIES_KEY]: undefined });
    expect(slotsOf(usageChart({ days: DAYS, series: [series[2]!] }, 'list', nameOf, 7, ['a', 'b', 'c']))).toEqual({ c: 3 });
  });

  it('should leave the neutral Other without a slot', () => {
    const series = [entry('a', [9, 0]), entry('b', [1, 0])];
    expect(usageChart({ days: DAYS, series }, 'list', nameOf, 1).series.at(-1)?.slot).toBeUndefined();
  });

  it('should rank by the chosen cost basis', () => {
    const billedOnly = { ...entry('paid', [1, 0]), totals: totals(1, 5) };
    const free = entry('free', [9, 0]);
    expect(usageChart({ days: DAYS, series: [free, billedOnly] }, 'billed', nameOf, 1).series.map(item => item.key)).toEqual(['paid']);
    expect(usageChart({ days: DAYS, series: [free, billedOnly] }, 'list', nameOf, 1).series.map(item => item.key)).toEqual(['free', OTHER_SERIES_KEY]);
  });

  it('should leave out series that cost nothing on the chosen basis', () => {
    expect(usageChart({ days: DAYS, series: [entry('a', [0, 0])] }, 'list', nameOf)).toEqual({ series: [], data: DAYS.map(day => ({ x: day, values: {} })) });
  });

  it('should give the unrecorded series a sentinel key, sorted last, named in words', () => {
    const chart = usageChart({ days: DAYS, series: [entry(null, [5, 5]), entry('b', [1, 1])] }, 'list', nameOf);
    expect(chart.series).toEqual([
      { key: 'b', label: 'b', slot: 1 },
      { key: UNRECORDED_SERIES_KEY, label: NOT_RECORDED, slot: 2 },
    ]);
    expect(chart.data[0]?.values[UNRECORDED_SERIES_KEY]).toBe(5);
  });

  it('should read a day missing from a series as zero', () => {
    const sparse = { ...entry('a', [4, 0]), points: [{ day: '2026-10-02', calls: 1, listCostUsd: 4, billedCostUsd: 0 }] };
    expect(usageChart({ days: DAYS, series: [sparse] }, 'list', nameOf).data.map(datum => datum.values.a)).toEqual([0, 4]);
  });
});

describe('previousPeriod', () => {
  it('should be the equal-length window ending where the period starts', () => {
    expect(previousPeriod({ from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' })).toEqual({
      from: '2026-08-31T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
    });
  });

  it('should keep a partial default window exact to the millisecond', () => {
    expect(previousPeriod({ from: '2026-09-25T14:03:12.500Z', to: '2026-10-25T14:03:12.500Z' })).toEqual({
      from: '2026-08-26T14:03:12.500Z',
      to: '2026-09-25T14:03:12.500Z',
    });
  });

  it('should refuse an empty, inverted or unreadable period', () => {
    expect(previousPeriod({ from: '2026-10-01T00:00:00Z', to: '2026-10-01T00:00:00Z' })).toBeNull();
    expect(previousPeriod({ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' })).toBeNull();
    expect(previousPeriod({ from: 'soon', to: '2026-10-01T00:00:00Z' })).toBeNull();
  });
});

describe('comparisonLabel', () => {
  it('should name the previous window by its length', () => {
    expect(comparisonLabel({ from: '2026-10-01T00:00:00Z', to: '2026-10-31T00:00:00Z' })).toBe('vs previous 30 days');
    expect(comparisonLabel({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' })).toBe('vs previous day');
  });
});

describe('totalsDeltas', () => {
  it('should compare every total with the previous period', () => {
    expect(totalsDeltas(totals(30, 15, 30), totals(20, 10, 10))).toEqual({ billed: 0.5, list: 0.5, calls: 2, averageListCost: -0.5 });
  });

  it('should give no deltas when the previous period is empty or unknown', () => {
    expect(totalsDeltas(totals(30, 15, 30), totals(0, 0, 0))).toEqual({});
    expect(totalsDeltas(totals(30, 15, 30), undefined)).toEqual({});
  });

  it('should skip a delta whose previous value is zero', () => {
    expect(totalsDeltas(totals(30, 15, 30), totals(20, 0, 10))).toEqual({ list: 0.5, calls: 2, averageListCost: -0.5 });
  });

  it('should skip the per-call delta when the current period has no calls', () => {
    expect(totalsDeltas(totals(0, 0, 0), totals(20, 10, 10))).toEqual({ billed: -1, list: -1, calls: -1 });
  });
});

describe('usageRows', () => {
  it('should order rows by the chosen cost, then the other cost, then calls', () => {
    const rows = usageRows([row('a', 1, 0), row('b', 5, 0), row('c', 1, 3), row('d', 1, 0, 9)], null, 'app', 'billed', EMPTY_NAMES);
    expect(rows.map(view => view.key)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('should work out share and average per call', () => {
    const [first, second] = usageRows([row('a', 3, 0, 2), row('b', 1, 0, 0)], null, 'app', 'list', EMPTY_NAMES);
    expect(first).toMatchObject({ share: 0.75, averageListCost: 1.5 });
    expect(second).toMatchObject({ share: 0.25, averageListCost: null });
  });

  it('should show no share when nothing cost anything', () => {
    expect(usageRows([row('a', 0)], null, 'app', 'list', EMPTY_NAMES)[0]?.share).toBeNull();
  });

  it('should compare each row with the same key in the previous period', () => {
    const rows = usageRows([row('a', 5), row('b', 2), row(null, 1)], [row('a', 8), row(null, 1)], 'app', 'list', EMPTY_NAMES);
    expect(rows.map(view => view.change)).toEqual([
      { kind: 'delta', usd: -3 },
      { kind: 'new', usd: 2 },
      { kind: 'delta', usd: 0 },
    ]);
  });

  it('should show no change when the previous period is unknown or empty', () => {
    expect(usageRows([row('a', 5)], null, 'app', 'list', EMPTY_NAMES)[0]?.change).toEqual({ kind: 'unavailable' });
    expect(usageRows([row('a', 5)], [], 'app', 'list', EMPTY_NAMES)[0]?.change).toEqual({ kind: 'unavailable' });
  });

  it('should name the unrecorded row in words and key it apart from real keys', () => {
    expect(usageRows([row(null, 1)], null, 'alias', 'list', EMPTY_NAMES)[0]).toMatchObject({ id: UNRECORDED_SERIES_KEY, name: NOT_RECORDED });
  });
});

describe('usageKeyName', () => {
  const names = usageNamesOf({
    tasks: { 'novel-forge.chat': { kind: 'chat', label: 'Writing chat', dataPolicy: 'any', routes: [{ model: 'opus' }] } },
    aliases: { opus: { label: 'Opus', model: 'opus-5', state: 'active' } },
    models: { 'opus-5': { label: 'Opus 5.5', capabilities: {}, deployments: [], pricePerMTok: { input: 1, output: 2 } } },
  });

  it('should name keys from the active catalog', () => {
    expect(usageKeyName('task', 'novel-forge.chat', names)).toBe('Novel Forge · Writing chat');
    expect(usageKeyName('alias', 'opus', names)).toBe('Opus');
    expect(usageKeyName('model', 'opus-5', names)).toBe('Opus 5.5');
  });

  it('should title-case apps and providers', () => {
    expect(usageKeyName('app', 'novel-forge', names)).toBe('Novel Forge');
    expect(usageKeyName('provider', 'open-router', names)).toBe('Open Router');
  });

  it('should fall back to the key shape for keys the catalog no longer has', () => {
    expect(usageKeyName('task', 'memoir.daily-reflection', names)).toBe('Memoir · Daily reflection');
    expect(usageKeyName('task', 'malformed', names)).toBe('malformed');
    expect(usageKeyName('model', 'gone-1', names)).toBe('gone-1');
  });

  it('should say a missing key was not recorded', () => {
    expect(usageKeyName('provider', null, names)).toBe(NOT_RECORDED);
  });
});

describe('formatters', () => {
  it('should print a short UTC day', () => {
    expect(formatShortDay('2026-10-03')).toBe('Oct 3');
    expect(formatShortDay('not a day')).toBe('not a day');
  });

  it('should keep small ticks distinct and large ones compact', () => {
    expect(formatUsdTick(0)).toBe('$0');
    expect(formatUsdTick(0.005)).toBe('$0.005');
    expect(formatUsdTick(0.01)).toBe('$0.01');
    expect(formatUsdTick(12.5)).toBe('$12.5');
    expect(formatUsdTick(5)).toBe('$5');
    expect(formatUsdTick(2500)).toBe('$2.5K');
  });

  it('should show a sub-cent cost per call by its significant digits', () => {
    expect(formatPerCall(0.000123)).toBe('$0.00012');
    expect(formatPerCall(0.25)).toBe('$0.2500');
    expect(formatPerCall(0)).toBe('$0.00');
  });
});

describe('csvField', () => {
  it('should quote text with commas, quotes or line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('should guard text that a spreadsheet would run as a formula', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-x')).toBe("'-x");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it('should leave numbers bare, negative ones included, without float noise', () => {
    expect(csvField(-3.5)).toBe('-3.5');
    expect(csvField(0.1 + 0.2)).toBe('0.3');
    expect(csvField(Number.NaN)).toBe('');
    expect(csvField(null)).toBe('');
  });
});

describe('toCsv', () => {
  it('should write a header and CRLF-terminated rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('a,b\r\n1,x\r\n');
  });
});

describe('usageCsv', () => {
  it('should export raw keys beside readable names with the change on the chosen basis', () => {
    const rows = usageRows([row('novel-forge', 2, 1), row(null, 1)], [row('novel-forge', 1, 1)], 'app', 'list', EMPTY_NAMES);
    const [header, first, second] = usageCsv(rows, 'app', 'list').split('\r\n');
    expect(header).toBe(
      'App key,App,Billed spend (USD),API-price cost (USD),Change in API-price cost vs previous period (USD),Previous period,Calls,Avg API-price cost per call (USD),Input tokens,Cached input tokens,Output tokens,Reasoning tokens',
    );
    expect(first).toBe('novel-forge,Novel Forge,1,2,1,Compared,1,2,0,0,0,0');
    expect(second).toBe(',Not recorded,0,1,1,New this period,1,1,0,0,0,0');
  });

  it('should leave the change empty and say so when there is no previous period to compare with', () => {
    const rows = usageRows([row('memoir', 3)], null, 'app', 'list', EMPTY_NAMES);
    expect(usageCsv(rows, 'app', 'list').split('\r\n')[1]).toBe('memoir,Memoir,0,3,,No comparison,1,3,0,0,0,0');
  });
});

describe('usageCsvFilename', () => {
  it('should name the covered days and the grouping', () => {
    expect(usageCsvFilename('2026-10-01', '2026-10-31', 'task')).toBe('synapse-usage-2026-10-01_2026-10-31-by-feature.csv');
    expect(usageCsvFilename('2026-10-01', '2026-10-31', 'alias')).toBe('synapse-usage-2026-10-01_2026-10-31-by-model-name.csv');
  });
});

describe('usageSlotKeys', () => {
  const names = usageNamesOf({
    tasks: {
      'novel-forge.chat': { kind: 'chat', dataPolicy: 'any', routes: [{ model: 'opus' }] },
      'novel-forge.outline': { kind: 'chat', dataPolicy: 'any', routes: [{ model: 'opus' }] },
      'memoir.recap': { kind: 'chat', dataPolicy: 'any', routes: [{ model: 'opus' }] },
    },
    aliases: { opus: { label: 'Opus', model: 'opus-5', state: 'active' } },
    models: { 'opus-5': { label: 'Opus 5.5', capabilities: {}, deployments: [], pricePerMTok: { input: 1, output: 2 } } },
  });

  it('should list each app once, and the catalog keys for every other grouping', () => {
    expect(usageSlotKeys('app', names).sort()).toEqual(['memoir', 'novel-forge']);
    expect(usageSlotKeys('task', names)).toHaveLength(3);
    expect(usageSlotKeys('alias', names)).toEqual(['opus']);
    expect(usageSlotKeys('model', names)).toEqual(['opus-5']);
    expect(usageSlotKeys('provider', names)).toEqual([]);
  });

  it('should be empty without a catalog', () => {
    expect(usageSlotKeys('task', EMPTY_NAMES)).toEqual([]);
  });
});
