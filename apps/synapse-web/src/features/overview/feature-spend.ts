import { splitTaskKey } from '@/features/catalog/catalog-readers';
import { type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { taskTitle } from '@/features/shared/naming';
import { type UsageSearch } from '@/features/usage/usage-search';
import { type UsageRowResponse } from '@/lib/apis/api-types.gen';

import { type SpendMeasure } from './daily-spend';
import { type UsageWindow } from './overview-periods';

export type FeatureUsageSearch = UsageSearch & { groupBy: 'task'; app?: string; task: string };

export interface FeatureSpendRow {
  id: string;
  title: string;
  /** The task id, shown under the title; absent for spend no task was recorded for */
  taskKey?: string;
  billedCostUsd: number;
  listCostUsd: number;
  share: number;
  usage?: FeatureUsageSearch;
}

export interface FeatureSpend {
  /** Billed spend, unless nothing was billed at all, when ranking by it would be arbitrary */
  basis: SpendMeasure;
  rows: FeatureSpendRow[];
}

export const TOP_FEATURES = 10;

const UNKNOWN_ROW_ID = '~unknown';

type TaskNames = Pick<TaskEntry, 'key' | 'app' | 'name' | 'label'>;

const measureOf = (row: UsageRowResponse, basis: SpendMeasure): number => (basis === 'billed' ? row.billedCostUsd : row.listCostUsd);

export function featureTitle(key: string, tasks: ReadonlyMap<string, TaskNames>): string {
  const task = tasks.get(key);
  if (task) return taskTitle(task);
  const parts = splitTaskKey(key);
  return parts ? taskTitle(parts) : key;
}

/** Usage defaults to the 30 days before now, not whole UTC days, so a link carries the window its numbers came from. */
export function windowSearch(window: UsageWindow): Pick<UsageSearch, 'from' | 'to'> {
  return { from: window.from, ...(window.to && { to: window.to }) };
}

export function featureUsageSearch(key: string, window: UsageWindow): FeatureUsageSearch {
  const parts = splitTaskKey(key);
  return { groupBy: 'task', ...windowSearch(window), ...(parts && { app: parts.app }), task: key };
}

export function featureSpendOf(rows: readonly UsageRowResponse[], tasks: readonly TaskNames[], window: UsageWindow, limit = TOP_FEATURES): FeatureSpend {
  const basis: SpendMeasure = rows.some(row => row.billedCostUsd > 0) ? 'billed' : 'list';
  const other: SpendMeasure = basis === 'billed' ? 'list' : 'billed';
  const total = rows.reduce((sum, row) => sum + measureOf(row, basis), 0);
  const names = new Map(tasks.map(task => [task.key, task]));
  const ranked = [...rows].sort(
    (left, right) => measureOf(right, basis) - measureOf(left, basis) || measureOf(right, other) - measureOf(left, other) || (left.key ?? '').localeCompare(right.key ?? ''),
  );
  return {
    basis,
    rows: ranked.slice(0, limit).map(row => ({
      id: row.key ?? UNKNOWN_ROW_ID,
      title: row.key === null ? 'Unknown feature' : featureTitle(row.key, names),
      ...(row.key !== null && { taskKey: row.key, usage: featureUsageSearch(row.key, window) }),
      billedCostUsd: row.billedCostUsd,
      listCostUsd: row.listCostUsd,
      share: total > 0 ? measureOf(row, basis) / total : 0,
    })),
  };
}
