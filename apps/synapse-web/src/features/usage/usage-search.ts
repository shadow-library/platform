import { type DateRange, type RangePreset } from '@shadow-library/ui';

import { type GetUsageQueryParams } from '@/lib';

export const USAGE_GROUPS = ['app', 'task', 'alias', 'model', 'provider', 'day'] as const;

export type UsageGroup = (typeof USAGE_GROUPS)[number];

export interface UsageSearch {
  from?: string;
  to?: string;
  groupBy: UsageGroup;
}

export const USAGE_GROUP_LABELS: Record<UsageGroup, string> = { app: 'App', task: 'Task', alias: 'Alias', model: 'Model', provider: 'Provider', day: 'Day' };

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const PRESET_DAYS = [7, 30, 90] as const;

/** `Date.parse` rolls an overflowing day into the next month, so a date counts only if it survives the round trip unchanged. */
function calendarDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10) === value ? value : undefined;
}

/** An empty or inverted range is dropped whole, falling back to the default window rather than reaching the picker or the server. */
export function parseUsageSearch(search: Record<string, unknown>): UsageSearch {
  const from = calendarDate(search.from);
  const to = calendarDate(search.to);
  const groupBy = USAGE_GROUPS.find(group => group === search.groupBy) ?? 'app';
  if (from && to && from >= to) return { groupBy };
  return { ...(from && { from }), ...(to && { to }), groupBy };
}

export function usageParams(search: UsageSearch): GetUsageQueryParams {
  return { groupBy: search.groupBy, ...(search.from && { from: search.from }), ...(search.to && { to: search.to }) };
}

export function addUtcDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The report's `to` is an exclusive instant — now, or a midnight bound — so the last day it covers is the one holding the millisecond before it. */
export function lastIncludedInstant(exclusiveEnd: string): string {
  const time = Date.parse(exclusiveEnd);
  return Number.isNaN(time) ? exclusiveEnd : new Date(time - 1).toISOString();
}

export function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The picker selects whole days inclusively while the server's `to` is exclusive, so the stored bound sits one UTC day past the shown one. */
export function pickerRangeOf(search: Pick<UsageSearch, 'from' | 'to'>): DateRange {
  return { start: search.from ?? null, end: search.to ? addUtcDays(search.to, -1) : null };
}

export function searchRangeOf(range: DateRange): Pick<UsageSearch, 'from' | 'to'> {
  return { ...(range.start && { from: range.start }), ...(range.end && { to: addUtcDays(range.end, 1) }) };
}

export function usageRangePresets(today: string): RangePreset[] {
  return PRESET_DAYS.map(days => ({ label: `Last ${days} days`, range: { start: addUtcDays(today, 1 - days), end: today } }));
}
