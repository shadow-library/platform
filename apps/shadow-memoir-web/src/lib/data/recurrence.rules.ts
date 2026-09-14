import { type Recurrence, type Weekday } from './quest.types';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const ISO_WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const EPOCH_WEEKDAY_OFFSET = 3;
const NEXT_OCCURRENCE_HORIZON_DAYS = 366;

interface CalendarDay {
  year: number;
  month: number;
  day: number;
  epochDay: number;
}

function floorMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function calendarDay(year: number, month: number, day: number): CalendarDay {
  return { year, month, day, epochDay: Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY) };
}

function fromEpochDay(epochDay: number): CalendarDay {
  const date = new Date(epochDay * MS_PER_DAY);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), epochDay };
}

function parseDay(value: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = calendarDay(Number(match[1]), Number(match[2]), Number(match[3]));
  const normalised = fromEpochDay(parsed.epochDay);
  return normalised.month === parsed.month && normalised.day === parsed.day ? parsed : null;
}

function formatDay({ year, month, day }: CalendarDay): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekdayIndex(epochDay: number): number {
  return floorMod(epochDay + EPOCH_WEEKDAY_OFFSET, DAYS_PER_WEEK);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthlyDay(recurrence: Recurrence, start: CalendarDay | null, year: number, month: number): number | null {
  const lastDay = daysInMonth(year, month);
  const pattern = recurrence.nthWeekday;
  if (pattern) {
    const target = ISO_WEEKDAYS.indexOf(pattern.weekday);
    if (pattern.ordinal === 'last') return lastDay - floorMod(weekdayIndex(calendarDay(year, month, lastDay).epochDay) - target, DAYS_PER_WEEK);
    return 1 + floorMod(target - weekdayIndex(calendarDay(year, month, 1).epochDay), DAYS_PER_WEEK) + (pattern.ordinal - 1) * DAYS_PER_WEEK;
  }
  const dayOfMonth = recurrence.dayOfMonth ?? start?.day ?? null;
  return dayOfMonth === null ? null : Math.min(dayOfMonth, lastDay);
}

function matchesPattern(recurrence: Recurrence, start: CalendarDay | null, date: CalendarDay): boolean {
  const interval = Math.max(1, Math.trunc(recurrence.interval));
  const inStep = (periods: number): boolean => start === null || floorMod(periods, interval) === 0;

  switch (recurrence.frequency) {
    case 'daily':
      return inStep(date.epochDay - (start?.epochDay ?? date.epochDay));
    case 'weekly': {
      if (!recurrence.daysOfWeek.includes(ISO_WEEKDAYS[weekdayIndex(date.epochDay)] as Weekday)) return false;
      const weekOf = (day: CalendarDay): number => day.epochDay - weekdayIndex(day.epochDay);
      return inStep((weekOf(date) - weekOf(start ?? date)) / DAYS_PER_WEEK);
    }
    case 'monthly':
      return inStep((date.year - (start?.year ?? date.year)) * 12 + date.month - (start?.month ?? date.month)) && monthlyDay(recurrence, start, date.year, date.month) === date.day;
    case 'yearly':
      return start !== null && inStep(date.year - start.year) && date.month === start.month && date.day === Math.min(start.day, daysInMonth(date.year, date.month));
  }
}

function occurrencesBefore(recurrence: Recurrence, start: CalendarDay, date: CalendarDay, stopAt: number): number {
  let count = 0;
  for (let epochDay = start.epochDay; epochDay < date.epochDay && count < stopAt; epochDay += 1) if (matchesPattern(recurrence, start, fromEpochDay(epochDay))) count += 1;
  return count;
}

/** Mirrors server `rules/recurrence.ts#occursOn`: an exception drops its date but still uses up a slot of a counted series. */
export function occursOn(recurrence: Recurrence, date: string): boolean {
  const day = parseDay(date);
  if (!day) return false;
  const start = parseDay(recurrence.startDate);
  if (start && day.epochDay < start.epochDay) return false;
  if (recurrence.end.kind === 'until' && date > recurrence.end.date) return false;
  if (!matchesPattern(recurrence, start, day)) return false;
  if (recurrence.exceptions.includes(date)) return false;
  if (recurrence.end.kind !== 'count' || start === null) return true;
  const count = Math.max(0, Math.trunc(recurrence.end.count));
  return occurrencesBefore(recurrence, start, day, count) < count;
}

/** Walks forward from `date` once, carrying a counted series' slot index instead of re-counting it per probe, and stops as soon as the series has ended. */
export function nextOccurrenceAfter(recurrence: Recurrence, date: string, horizonDays = NEXT_OCCURRENCE_HORIZON_DAYS): string | null {
  const from = parseDay(date);
  if (!from) return null;
  const start = parseDay(recurrence.startDate);
  const { end } = recurrence;
  const firstEpochDay = Math.max(from.epochDay + 1, start?.epochDay ?? -Infinity);
  const count = end.kind === 'count' && start ? Math.max(0, Math.trunc(end.count)) : null;
  let used = count === null || !start ? 0 : occurrencesBefore(recurrence, start, fromEpochDay(firstEpochDay), count);

  for (let epochDay = firstEpochDay; epochDay <= from.epochDay + horizonDays; epochDay += 1) {
    if (count !== null && used >= count) return null;
    const candidate = fromEpochDay(epochDay);
    const iso = formatDay(candidate);
    if (end.kind === 'until' && iso > end.date) return null;
    if (!matchesPattern(recurrence, start, candidate)) continue;
    if (!recurrence.exceptions.includes(iso)) return iso;
    used += 1;
  }
  return null;
}
