import { addUtcDays, utcToday } from '@/features/usage/usage-search';

export interface UsageWindow {
  from: string;
  /** Absent means now, so the month-to-date numbers keep counting while the page is open */
  to?: string;
}

export interface MonthToDate {
  current: UsageWindow;
  /** Null in the first hour of a month, when too little has elapsed to compare */
  previous: UsageWindow | null;
  /** Read after "versus" by assistive technology, so it carries no "vs" of its own */
  comparison: string | null;
}

export interface OverviewPeriods {
  today: string;
  month: MonthToDate;
}

export const SPEND_RANGES = [30, 90] as const;

export type SpendRange = (typeof SPEND_RANGES)[number];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const MONTH_NAME = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

function monthStartOf(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** The previous window matches the time elapsed this month to the minute, so the 1st compares hours with hours; under an hour is too little to compare. */
export function monthToDate(now: Date): MonthToDate {
  const start = monthStartOf(now.getUTCFullYear(), now.getUTCMonth());
  const previousStart = monthStartOf(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const current = { from: isoDate(start) };
  const elapsed = Math.floor((now.getTime() - start.getTime()) / MINUTE_MS) * MINUTE_MS;
  if (elapsed < HOUR_MS) return { current, previous: null, comparison: null };
  const previousMonth = MONTH_NAME.format(previousStart);
  const end = previousStart.getTime() + elapsed;
  if (end >= start.getTime()) return { current, previous: { from: isoDate(previousStart), to: current.from }, comparison: `all of ${previousMonth}` };
  return { current, previous: { from: isoDate(previousStart), to: new Date(end).toISOString() }, comparison: `same time in ${previousMonth}` };
}

export function overviewPeriods(now: Date): OverviewPeriods {
  return { today: utcToday(now), month: monthToDate(now) };
}

export function lastDays(today: string, days: SpendRange): UsageWindow {
  return { from: addUtcDays(today, 1 - days) };
}

/** No baseline, or a baseline of nothing, has no meaningful change: it is left out rather than shown as an infinite rise. */
export function changeFrom(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined || !(previous > 0)) return undefined;
  const change = (current - previous) / previous;
  return Number.isFinite(change) ? change : undefined;
}
