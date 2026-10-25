import { type DateRange, type RangePreset } from '@shadow-library/ui';

import { splitTaskKey } from '@/features/catalog/catalog-readers';
import { ownEntry } from '@/features/catalog/catalog-values';
import { type TaskEntry } from '@/features/catalog/catalog-spec.types';
import { formatDate } from '@/features/shared/format';
import { taskTitle } from '@/features/shared/naming';
import { type GetUsageQueryParams, type GetUsageSeriesQueryParams } from '@/lib/apis/api-types.gen';

import { type CostBasis } from './usage-report';

export const USAGE_GROUPS = ['app', 'task', 'alias', 'model', 'provider'] as const;

export type UsageGroup = (typeof USAGE_GROUPS)[number];

export interface UsageSearch {
  from?: string;
  to?: string;
  app?: string;
  task?: string;
  groupBy: UsageGroup;
  /** Absent means billed, so a plain link keeps the default */
  basis?: 'list';
}

export type UsageFilters = Pick<UsageSearch, 'app' | 'task'>;

export const USAGE_GROUP_LABELS: Readonly<Record<UsageGroup, string>> = { app: 'App', task: 'Feature', alias: 'Model name', model: 'Model', provider: 'Provider' };

/** Links from before the chart replaced the day grouping keep working. */
const LEGACY_GROUPS: Readonly<Record<string, UsageGroup>> = { day: 'app' };

/** synapse-server's `SELECTOR_TOKEN`, which it applies to the `app` and `task` filters and refuses the whole report on a mismatch. */
const FILTER_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

/** synapse-server's `MAX_USAGE_RANGE_DAYS`: the generated API types carry it only in a description, so it is mirrored here. */
export const MAX_USAGE_RANGE_DAYS = 400;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const PRESET_DAYS = [7, 30, 90] as const;

function utcMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** `Date.parse` rolls an overflowing day into the next month, so a date counts only if it survives the round trip unchanged. */
function calendarDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) return undefined;
  const time = utcMidnight(value);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10) === value ? value : undefined;
}

/**
 * Whether the server will report on `[from, to)`: not empty, not inverted, and no longer than its cap. A missing `to` is the server's
 * default of now; a missing `from` needs no check, because the server then starts a fixed default window before `to`.
 */
export function isReportableRange(from: string, to: string | undefined, now: Date): boolean {
  const start = utcMidnight(from);
  const end = to ? utcMidnight(to) : now.getTime();
  return start < end && end - start <= MAX_USAGE_RANGE_DAYS * DAY_MS;
}

function filterToken(value: unknown): string | undefined {
  return typeof value === 'string' && FILTER_TOKEN.test(value) ? value : undefined;
}

function basisOf(value: unknown): Pick<UsageSearch, 'basis'> {
  return value === 'list' ? { basis: 'list' } : {};
}

export function costBasisOf(search: Pick<UsageSearch, 'basis'>): CostBasis {
  return search.basis ?? 'billed';
}

export function withBasis(search: UsageSearch, basis: CostBasis): UsageSearch {
  const { basis: _basis, ...rest } = search;
  return { ...rest, ...basisOf(basis) };
}

function groupOf(value: unknown): UsageGroup {
  if (typeof value !== 'string') return 'app';
  return USAGE_GROUPS.find(group => group === value) ?? ownEntry(LEGACY_GROUPS, value) ?? 'app';
}

export function taskBelongsTo(task: string, app: string): boolean {
  return splitTaskKey(task)?.app === app;
}

/** A feature belongs to exactly one app, so an app filter that contradicts the feature filter would only ever report nothing; the feature wins. */
function filtersOf(search: Record<string, unknown>): UsageFilters {
  const app = filterToken(search.app);
  const task = filterToken(search.task);
  const keepApp = app !== undefined && (task === undefined || taskBelongsTo(task, app));
  return { ...(keepApp && { app }), ...(task && { task }) };
}

/** A range the server would refuse is dropped whole, falling back to the default window rather than reaching the picker or the server. */
export function parseUsageSearch(search: Record<string, unknown>, now: Date): UsageSearch {
  const from = calendarDate(search.from);
  const to = calendarDate(search.to);
  const rest = { ...filtersOf(search), groupBy: groupOf(search.groupBy), ...basisOf(search.basis) };
  if (from && !isReportableRange(from, to, now)) return rest;
  return { ...(from && { from }), ...(to && { to }), ...rest };
}

export function usageParams(search: UsageSearch): GetUsageQueryParams & GetUsageSeriesQueryParams {
  const { from, to, app, task, groupBy } = search;
  return { groupBy, ...(from && { from }), ...(to && { to }), ...(app && { app }), ...(task && { task }) };
}

export function withApp(search: UsageSearch, app: string | undefined): UsageSearch {
  const { app: _app, task, ...rest } = search;
  const keepTask = task !== undefined && (app === undefined || taskBelongsTo(task, app));
  return { ...rest, ...(app && { app }), ...(keepTask && { task }) };
}

export function withTask(search: UsageSearch, task: string | undefined): UsageSearch {
  const { task: _task, ...rest } = search;
  return { ...rest, ...(task && { task }) };
}

export function withRange(search: UsageSearch, range: Pick<UsageSearch, 'from' | 'to'>): UsageSearch {
  const { from: _from, to: _to, ...rest } = search;
  return { ...rest, ...range };
}

/** A link may name an app the active catalog no longer has; the filter still has to show it. */
export function filterApps(tasks: readonly TaskEntry[], chosen: string | undefined): string[] {
  const apps = new Set(tasks.map(task => task.app));
  if (chosen) apps.add(chosen);
  return [...apps].sort();
}

export interface FeatureOption {
  key: string;
  title: string;
}

export function filterTasks(tasks: readonly TaskEntry[], app: string | undefined, chosen: string | undefined): FeatureOption[] {
  const options = tasks.filter(task => app === undefined || task.app === app).map(task => ({ key: task.key, title: taskTitle(task) }));
  if (chosen !== undefined && !options.some(option => option.key === chosen)) {
    const parts = splitTaskKey(chosen);
    options.push({ key: chosen, title: parts ? taskTitle(parts) : chosen });
  }
  return options.sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}

export function addUtcDays(date: string, days: number): string {
  return new Date(utcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The report's `to` is an exclusive instant — now, or a midnight bound — so the last day it covers is the one holding the millisecond before it. */
export function lastIncludedInstant(exclusiveEnd: string): string {
  const time = Date.parse(exclusiveEnd);
  return Number.isNaN(time) ? exclusiveEnd : new Date(time - 1).toISOString();
}

export function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Shows the server's exclusive `to` as the last included day; an open end shows the report's own last day, so server and browser render alike. */
export function pickerRangeOf(search: Pick<UsageSearch, 'from' | 'to'>, reportLastDay: string | null): DateRange {
  if (search.to) return { start: search.from ?? null, end: addUtcDays(search.to, -1) };
  return { start: search.from ?? null, end: search.from ? reportLastDay : null };
}

/** `period` is the report's own `[from, to)`; `today` is null until the clock is read after hydration, so the server render prints a date. */
export function usagePeriodText(period: { from: string; to: string }, today: string | null): string {
  const last = lastIncludedInstant(period.to);
  return `${formatDate(period.from)} – ${today !== null && last.slice(0, 10) === today ? 'today' : formatDate(last)}`;
}

export function searchRangeOf(range: DateRange): Pick<UsageSearch, 'from' | 'to'> {
  return { ...(range.start && { from: range.start }), ...(range.end && { to: addUtcDays(range.end, 1) }) };
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function usageRangePresets(today: string): RangePreset[] {
  const thisMonth = monthStart(today);
  const lastMonthEnd = addUtcDays(thisMonth, -1);
  return [
    ...PRESET_DAYS.map(days => ({ label: `Last ${days} days`, range: { start: addUtcDays(today, 1 - days), end: today } })),
    { label: 'This month', range: { start: thisMonth, end: today } },
    { label: 'Last month', range: { start: monthStart(lastMonthEnd), end: lastMonthEnd } },
  ];
}
