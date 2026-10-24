import { type ChartDatum, type ChartSeries } from '@shadow-library/ui';

import { cyclicChartSlots } from '@/features/shared/chart-slots';
import { appName } from '@/features/shared/naming';
import { type UsageSeriesEntryResponse, type UsageSeriesResponse } from '@/lib/apis/api-types.gen';

export type SpendMeasure = 'billed' | 'list';

export interface DailySpend {
  data: ChartDatum[];
  series: ChartSeries[];
  total: number;
}

const MAX_CHART_SERIES = 8;

/** Tildes cannot occur in an app key, so these never collide with a real app */
export const OTHER_SERIES_KEY = '~other';
export const UNKNOWN_SERIES_KEY = '~unknown';

const MEASURE_FIELDS = { billed: 'billedCostUsd', list: 'listCostUsd' } as const satisfies Record<SpendMeasure, 'billedCostUsd' | 'listCostUsd'>;

const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const COMPACT_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const WHOLE_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const CENTS_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 });

const seriesKeyOf = (entry: UsageSeriesEntryResponse): string => entry.key ?? UNKNOWN_SERIES_KEY;

function byListCost(left: UsageSeriesEntryResponse, right: UsageSeriesEntryResponse): number {
  return right.totals.listCostUsd - left.totals.listCostUsd || seriesKeyOf(left).localeCompare(seriesKeyOf(right));
}

/** Stacks keep a stable order as spend ranks shift; the unknown bucket sorts last. */
function byKey(left: UsageSeriesEntryResponse, right: UsageSeriesEntryResponse): number {
  if (left.key === null || right.key === null) return Number(left.key === null) - Number(right.key === null);
  return left.key.localeCompare(right.key);
}

function pointValues(entry: UsageSeriesEntryResponse, measure: SpendMeasure): Map<string, number> {
  const field = MEASURE_FIELDS[measure];
  return new Map(entry.points.map(point => [point.day, point[field]]));
}

export function dailySpendOf(response: UsageSeriesResponse, measure: SpendMeasure): DailySpend {
  const slots = cyclicChartSlots(response.series.map(entry => entry.key));
  const ranked = [...response.series].sort(byListCost);
  const folds = ranked.length > MAX_CHART_SERIES;
  const shown = (folds ? ranked.slice(0, MAX_CHART_SERIES - 1) : ranked).sort(byKey);
  const folded = folds ? ranked.slice(MAX_CHART_SERIES - 1) : [];
  const shownValues = shown.map(entry => ({ key: seriesKeyOf(entry), values: pointValues(entry, measure) }));
  const foldedValues = folded.map(entry => pointValues(entry, measure));

  const data = response.days.map(day => {
    const values: Record<string, number> = {};
    for (const { key, values: byDay } of shownValues) values[key] = byDay.get(day) ?? 0;
    if (folds) values[OTHER_SERIES_KEY] = foldedValues.reduce((sum, byDay) => sum + (byDay.get(day) ?? 0), 0);
    return { x: day, values };
  });
  const series: ChartSeries[] = [
    ...shown.map(entry => ({ key: seriesKeyOf(entry), label: entry.key === null ? 'Unknown app' : appName(entry.key), slot: slots.get(entry.key) })),
    ...(folds ? [{ key: OTHER_SERIES_KEY, label: `${folded.length} other apps`, tone: 'neutral' as const }] : []),
  ];
  return { data, series, total: response.totals[MEASURE_FIELDS[measure]] };
}

export function formatDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(time) ? day : DAY_LABEL.format(time);
}

export function formatUsdTick(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return COMPACT_USD.format(value);
  if (magnitude >= 1 || magnitude === 0) return WHOLE_USD.format(value);
  return CENTS_USD.format(value);
}
