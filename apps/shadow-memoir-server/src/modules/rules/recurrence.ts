import {
  addDays,
  addMonths,
  clampToMonthEnd,
  compareLocalDates,
  formatLocalDate,
  type LocalDate,
  localDateOf,
  nthWeekdayOfMonth,
  type NthWeekdayOrdinal,
  startOfMondayWeek,
  type Weekday,
} from './time';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type MonthlyPattern =
  { readonly kind: 'day_of_month'; readonly dayOfMonth: number } | { readonly kind: 'nth_weekday'; readonly weekday: Weekday; readonly ordinal: NthWeekdayOrdinal };

export type RecurrenceEnd = { readonly kind: 'never' } | { readonly kind: 'count'; readonly count: number } | { readonly kind: 'until'; readonly date: LocalDate };

interface RecurrenceSpec {
  /** Every N units of the frequency; values below 1 are read as 1. */
  readonly interval: number;
  /** Lower bound of the series, not itself an occurrence unless it matches the pattern. */
  readonly startDate: LocalDate;
  readonly end: RecurrenceEnd;
  /** Excluded dates; an exception still consumes its slot under a COUNT end, so the occurrence index is stable against edits. */
  readonly exceptions?: readonly LocalDate[];
}

export interface DailyRecurrence extends RecurrenceSpec {
  readonly frequency: 'daily';
}

export interface WeeklyRecurrence extends RecurrenceSpec {
  readonly frequency: 'weekly';
  readonly daysOfWeek: readonly [Weekday, ...Weekday[]];
}

export interface MonthlyRecurrence extends RecurrenceSpec {
  readonly frequency: 'monthly';
  readonly pattern: MonthlyPattern;
}

export interface YearlyRecurrence extends RecurrenceSpec {
  readonly frequency: 'yearly';
}

export type RecurrenceRule = DailyRecurrence | WeeklyRecurrence | MonthlyRecurrence | YearlyRecurrence;

export interface Occurrence {
  readonly date: LocalDate;
  readonly index: number;
}

/** A previously observed occurrence with its index, letting an expansion resume instead of counting from the start date. */
export type OccurrenceCursor = Occurrence;

export interface ExpansionWindow {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export interface Expansion {
  readonly occurrences: readonly Occurrence[];
  /** The last raw occurrence at or before `window.to`, suitable as the next call's cursor. */
  readonly cursor: OccurrenceCursor | null;
}

const intervalOf = (rule: RecurrenceRule): number => Math.max(1, Math.trunc(rule.interval));

const periodStartOf = (rule: RecurrenceRule, date: LocalDate): LocalDate => {
  if (rule.frequency === 'weekly') return startOfMondayWeek(date);
  if (rule.frequency === 'monthly') return localDateOf(date.year, date.month, 1);
  if (rule.frequency === 'yearly') return localDateOf(date.year, 1, 1);
  return date;
};

const advancePeriod = (rule: RecurrenceRule, period: LocalDate): LocalDate => {
  const step = intervalOf(rule);
  if (rule.frequency === 'daily') return addDays(period, step);
  if (rule.frequency === 'weekly') return addDays(period, step * 7);
  if (rule.frequency === 'monthly') return addMonths(period, step);
  return addMonths(period, step * 12);
};

const weeklyDates = (rule: WeeklyRecurrence, weekStart: LocalDate): readonly LocalDate[] =>
  [...new Set(rule.daysOfWeek)].sort((left, right) => left - right).map(weekday => addDays(weekStart, weekday - 1));

const monthlyDate = (pattern: MonthlyPattern, year: number, month: number): LocalDate =>
  pattern.kind === 'day_of_month' ? clampToMonthEnd(year, month, pattern.dayOfMonth) : nthWeekdayOfMonth(year, month, pattern.weekday, pattern.ordinal);

const datesInPeriod = (rule: RecurrenceRule, period: LocalDate): readonly LocalDate[] => {
  if (rule.frequency === 'weekly') return weeklyDates(rule, period);
  if (rule.frequency === 'monthly') return [monthlyDate(rule.pattern, period.year, period.month)];
  if (rule.frequency === 'yearly') return [clampToMonthEnd(period.year, rule.startDate.month, rule.startDate.day)];
  return [period];
};

function* rawOccurrences(rule: RecurrenceRule, anchor: Occurrence): Generator<Occurrence> {
  let period = periodStartOf(rule, anchor.date);
  let index = anchor.index;
  let isAnchorPeriod = true;

  for (;;) {
    for (const date of datesInPeriod(rule, period)) {
      if (compareLocalDates(date, rule.startDate) < 0) continue;
      if (isAnchorPeriod && compareLocalDates(date, anchor.date) < 0) continue;
      yield { date, index };
      index++;
    }
    isAnchorPeriod = false;
    period = advancePeriod(rule, period);
  }
}

const withinEnd = (end: RecurrenceEnd, occurrence: Occurrence): boolean => {
  if (end.kind === 'count') return occurrence.index < Math.max(0, Math.trunc(end.count));
  if (end.kind === 'until') return compareLocalDates(occurrence.date, end.date) <= 0;
  return true;
};

const anchorFor = (rule: RecurrenceRule, cursor: OccurrenceCursor | null | undefined, notAfter: LocalDate): Occurrence => {
  if (!cursor || cursor.index < 0) return { date: rule.startDate, index: 0 };
  if (compareLocalDates(cursor.date, rule.startDate) < 0 || compareLocalDates(cursor.date, notAfter) > 0) return { date: rule.startDate, index: 0 };
  return cursor;
};

const exceptionSet = (rule: RecurrenceRule): ReadonlySet<string> => new Set((rule.exceptions ?? []).map(formatLocalDate));

export const expandRecurrence = (rule: RecurrenceRule, window: ExpansionWindow, cursor?: OccurrenceCursor | null): Expansion => {
  if (compareLocalDates(window.from, window.to) > 0) return { occurrences: [], cursor: null };

  const excluded = exceptionSet(rule);
  const occurrences: Occurrence[] = [];
  let last: OccurrenceCursor | null = null;

  for (const occurrence of rawOccurrences(rule, anchorFor(rule, cursor, window.from))) {
    if (!withinEnd(rule.end, occurrence)) break;
    if (compareLocalDates(occurrence.date, window.to) > 0) break;
    last = occurrence;
    if (compareLocalDates(occurrence.date, window.from) < 0) continue;
    if (excluded.has(formatLocalDate(occurrence.date))) continue;
    occurrences.push(occurrence);
  }

  return { occurrences, cursor: last };
};

export const occursOn = (rule: RecurrenceRule, date: LocalDate, cursor?: OccurrenceCursor | null): boolean =>
  expandRecurrence(rule, { from: date, to: date }, cursor).occurrences.length > 0;

export const nextOccurrenceOnOrAfter = (rule: RecurrenceRule, date: LocalDate, cursor?: OccurrenceCursor | null): Occurrence | null => {
  const excluded = exceptionSet(rule);

  for (const occurrence of rawOccurrences(rule, anchorFor(rule, cursor, date))) {
    if (!withinEnd(rule.end, occurrence)) return null;
    if (compareLocalDates(occurrence.date, date) < 0) continue;
    if (excluded.has(formatLocalDate(occurrence.date))) continue;
    return occurrence;
  }
  return null;
};
