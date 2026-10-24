import { type ChartDatum, type ChartSeries } from '@shadow-library/ui';

import { type CatalogDocument } from '@/features/catalog/catalog-document';
import { readAliases, readModels, readProviders, readTasks, splitTaskKey } from '@/features/catalog/catalog-readers';
import { type AliasEntry, type ModelEntry, type ProviderEntry, type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { cyclicChartSlots } from '@/features/shared/chart-slots';
import { formatUsd, usdFormat } from '@/features/shared/format';
import { aliasName, appName, modelName, providerName, taskTitle } from '@/features/shared/naming';
import { type UsageRowResponse, type UsageSeriesResponse, type UsageTotalsResponse } from '@/lib/apis/api-types.gen';

import { type UsageGroup } from './usage-search';

export type CostBasis = 'billed' | 'list';

export const COST_BASES: readonly CostBasis[] = ['billed', 'list'];

export const COST_BASIS_LABELS: Readonly<Record<CostBasis, string>> = { billed: 'Billed', list: 'API-price' };

export const BASIS_NOUNS: Readonly<Record<CostBasis, string>> = { billed: 'billed spend', list: 'API-price cost' };

export const CHANGE_LABELS: Readonly<Record<CostBasis, string>> = {
  billed: 'Change in billed spend vs previous period',
  list: 'Change in API-price cost vs previous period',
};

export const NOT_RECORDED = 'Not recorded';

/** Real keys are selector tokens (letters, digits, `.`, `_`, `-`), so bracketed sentinels can never collide with one. */
export const OTHER_SERIES_KEY = '[other]';
export const UNRECORDED_SERIES_KEY = '[none]';

export const CHART_SERIES_LIMIT = 7;

interface Costs {
  listCostUsd: number;
  billedCostUsd: number;
}

export interface UsagePeriod {
  from: string;
  to: string;
}

export interface UsageNames {
  tasks: ReadonlyMap<string, TaskEntry>;
  aliases: ReadonlyMap<string, AliasEntry>;
  models: ReadonlyMap<string, ModelEntry>;
  providers: ReadonlyMap<string, ProviderEntry>;
}

export interface UsageTotalsDeltas {
  billed?: number;
  list?: number;
  calls?: number;
  averageListCost?: number;
}

export type UsageChange = { kind: 'unavailable' } | { kind: 'new'; usd: number } | { kind: 'delta'; usd: number };

export interface UsageRowView extends UsageRowResponse {
  id: string;
  name: string;
  averageListCost: number | null;
  share: number | null;
  change: UsageChange;
}

export interface UsageChartView {
  series: ChartSeries[];
  data: ChartDatum[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COMPACT_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const WHOLE_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const SMALL_USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 });
const PER_CALL_OPTIONS: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD', minimumSignificantDigits: 2, maximumSignificantDigits: 2 };
const CENT = 0.01;
const PER_CALL_USD = new Intl.NumberFormat('en-US', PER_CALL_OPTIONS);

export function costOf(costs: Costs, basis: CostBasis): number {
  return basis === 'billed' ? costs.billedCostUsd : costs.listCostUsd;
}

export const EMPTY_NAMES: UsageNames = { tasks: new Map(), aliases: new Map(), models: new Map(), providers: new Map() };

export function usageNamesOf(document: CatalogDocument | undefined): UsageNames {
  if (!document) return EMPTY_NAMES;
  return {
    tasks: new Map(readTasks(document).map(task => [task.key, task])),
    aliases: new Map(readAliases(document).map(alias => [alias.key, alias])),
    models: new Map(readModels(document).map(model => [model.key, model])),
    providers: new Map(readProviders(document).map(provider => [provider.key, provider])),
  };
}

/** Keys the active catalog no longer knows still get the best name their shape allows, since the ledger outlives catalog versions. */
export function usageKeyName(group: UsageGroup, key: string | null, names: UsageNames): string {
  if (key === null) return NOT_RECORDED;
  switch (group) {
    case 'app':
      return appName(key);
    case 'task': {
      const parts = names.tasks.get(key) ?? splitTaskKey(key);
      return parts ? taskTitle(parts) : key;
    }
    case 'alias': {
      const alias = names.aliases.get(key);
      return alias ? aliasName(alias) : key;
    }
    case 'model': {
      const model = names.models.get(key);
      return model ? modelName(model) : key;
    }
    case 'provider':
      return providerName(key);
  }
}

export function previousPeriod(period: UsagePeriod): UsagePeriod | null {
  const from = Date.parse(period.from);
  const to = Date.parse(period.to);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null;
  return { from: new Date(from - (to - from)).toISOString(), to: new Date(from).toISOString() };
}

const DAY_MS = 86_400_000;

export function comparisonLabel(period: UsagePeriod): string {
  const days = Math.round((Date.parse(period.to) - Date.parse(period.from)) / DAY_MS);
  if (!Number.isFinite(days) || days < 1) return 'vs previous period';
  return days === 1 ? 'vs previous day' : `vs previous ${days} days`;
}

export function relativeChange(current: number, previous: number): number | undefined {
  return previous > 0 ? (current - previous) / previous : undefined;
}

export function averageListCost(totals: Pick<UsageTotalsResponse, 'calls' | 'listCostUsd'>): number | null {
  return totals.calls > 0 ? totals.listCostUsd / totals.calls : null;
}

/** An empty previous period has nothing to compare against, so it yields no deltas rather than a wall of "+100%". */
export function totalsDeltas(current: UsageTotalsResponse, previous: UsageTotalsResponse | undefined): UsageTotalsDeltas {
  if (!previous || previous.calls === 0) return {};
  const currentAverage = averageListCost(current);
  const previousAverage = averageListCost(previous);
  const average = currentAverage === null || previousAverage === null ? undefined : relativeChange(currentAverage, previousAverage);
  const deltas: UsageTotalsDeltas = {};
  const billed = relativeChange(current.billedCostUsd, previous.billedCostUsd);
  const list = relativeChange(current.listCostUsd, previous.listCostUsd);
  const calls = relativeChange(current.calls, previous.calls);
  if (billed !== undefined) deltas.billed = billed;
  if (list !== undefined) deltas.list = list;
  if (calls !== undefined) deltas.calls = calls;
  if (average !== undefined) deltas.averageListCost = average;
  return deltas;
}

function compareKeys(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function rowChange(row: UsageRowResponse, previous: Map<string | null, UsageRowResponse> | null, basis: CostBasis): UsageChange {
  if (!previous) return { kind: 'unavailable' };
  const before = previous.get(row.key);
  if (!before) return { kind: 'new', usd: costOf(row, basis) };
  return { kind: 'delta', usd: costOf(row, basis) - costOf(before, basis) };
}

/** An unknown or empty previous period shows no change at all rather than marking every row new. */
export function usageRows(
  rows: readonly UsageRowResponse[],
  previousRows: readonly UsageRowResponse[] | null,
  group: UsageGroup,
  basis: CostBasis,
  names: UsageNames,
): UsageRowView[] {
  const other: CostBasis = basis === 'billed' ? 'list' : 'billed';
  const total = rows.reduce((sum, row) => sum + costOf(row, basis), 0);
  const previous = previousRows && previousRows.length > 0 ? new Map(previousRows.map(row => [row.key, row])) : null;
  return [...rows]
    .sort((a, b) => costOf(b, basis) - costOf(a, basis) || costOf(b, other) - costOf(a, other) || b.calls - a.calls || compareKeys(a.key, b.key))
    .map(row => ({
      ...row,
      id: row.key ?? UNRECORDED_SERIES_KEY,
      name: usageKeyName(group, row.key, names),
      averageListCost: averageListCost(row),
      share: total > 0 ? costOf(row, basis) / total : null,
      change: rowChange(row, previous, basis),
    }));
}

export function usageSlotKeys(group: UsageGroup, names: UsageNames): string[] {
  switch (group) {
    case 'app':
      return [...new Set([...names.tasks.values()].map(task => task.app))];
    case 'task':
      return [...names.tasks.keys()];
    case 'alias':
      return [...names.aliases.keys()];
    case 'model':
      return [...names.models.keys()];
    case 'provider':
      return [...names.providers.keys()];
  }
}

/** Colours are pinned from every key the catalog and the unfiltered response know, so a series keeps its colour as the kept set changes; kept series stack in key order. */
export function usageChart(
  response: Pick<UsageSeriesResponse, 'days' | 'series'>,
  basis: CostBasis,
  nameOf: (key: string | null) => string,
  limit = CHART_SERIES_LIMIT,
  slotKeys: Iterable<string> = [],
): UsageChartView {
  const slots = cyclicChartSlots([...slotKeys, ...response.series.map(entry => entry.key)]);
  const ranked = response.series
    .map(entry => ({ entry, total: costOf(entry.totals, basis) }))
    .filter(ranking => ranking.total > 0)
    .sort((a, b) => b.total - a.total || compareKeys(a.entry.key, b.entry.key));
  const kept = ranked
    .slice(0, limit)
    .map(ranking => ranking.entry)
    .sort((a, b) => compareKeys(a.key, b.key));
  const folded = ranked.slice(limit).map(ranking => ranking.entry);
  const plotted = kept.map(entry => ({ key: entry.key ?? UNRECORDED_SERIES_KEY, entry }));

  const valueOn = (entry: (typeof kept)[number], day: string): number => {
    const point = entry.points.find(candidate => candidate.day === day);
    return point ? costOf(point, basis) : 0;
  };
  const data = response.days.map(day => {
    const values: Record<string, number> = Object.fromEntries(plotted.map(({ key, entry }) => [key, valueOn(entry, day)]));
    if (folded.length > 0) values[OTHER_SERIES_KEY] = folded.reduce((sum, entry) => sum + valueOn(entry, day), 0);
    return { x: day, values };
  });
  const series: ChartSeries[] = plotted.map(({ key, entry }) => ({ key, label: nameOf(entry.key), slot: slots.get(entry.key) }));
  if (folded.length > 0) series.push({ key: OTHER_SERIES_KEY, label: `Other (${folded.length})`, tone: 'neutral' });
  return { series, data };
}

export function formatShortDay(day: string): string {
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time)) return day;
  const date = new Date(time);
  return `${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCDate()}`;
}

/** A call often costs a fraction of a cent, which `usdFormat`'s four decimals would print as $0.0000. */
export function perCallFormat(value: number): Intl.NumberFormatOptions {
  return value === 0 || Math.abs(value) >= CENT ? usdFormat(value) : PER_CALL_OPTIONS;
}

export function formatPerCall(value: number): string {
  return value === 0 || Math.abs(value) >= CENT ? formatUsd(value) : PER_CALL_USD.format(value);
}

/** Daily API-price costs are often cents, so sub-dollar ticks keep two significant digits instead of rounding every gridline to $0. */
export function formatUsdTick(value: number): string {
  const size = Math.abs(value);
  if (size === 0) return '$0';
  if (size >= 1000) return COMPACT_USD.format(value);
  return size >= 1 ? WHOLE_USD.format(value) : SMALL_USD.format(value);
}
