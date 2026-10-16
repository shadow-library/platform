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

function calendarDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) return undefined;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? undefined : value;
}

export function parseUsageSearch(search: Record<string, unknown>): UsageSearch {
  const from = calendarDate(search.from);
  const to = calendarDate(search.to);
  const groupBy = USAGE_GROUPS.find(group => group === search.groupBy) ?? 'app';
  return { ...(from && { from }), ...(to && { to }), groupBy };
}

export function usageParams(search: UsageSearch): GetUsageQueryParams {
  return { groupBy: search.groupBy, ...(search.from && { from: search.from }), ...(search.to && { to: search.to }) };
}

/** Caught here so an empty range is explained beside the fields instead of coming back as a server 400; the server still checks the 400-day cap. */
export function rangeProblem(from?: string, to?: string): string | null {
  if (from && to && from >= to) return 'The start must be before the end, which is exclusive.';
  return null;
}
