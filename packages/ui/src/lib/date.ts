import { DEFAULT_LOCALE } from './locale';

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function buildMonthMatrix(year: number, month: number, weekStartsOn = 0): Date[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  let cursor = addDays(first, -offset);
  const weeks: Date[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(days);
  }
  return weeks;
}

const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const longDateFormats = new Map<string, Intl.DateTimeFormat>();

/** Long, screen-reader-friendly label ("Tuesday, June 30, 2026"). Locale is pinned so SSR and client agree. */
export function formatLongDate(date: Date, locale: string = DEFAULT_LOCALE): string {
  if (Number.isNaN(date.getTime())) return date.toLocaleDateString(locale, LONG_DATE_OPTIONS);
  // `toLocaleDateString` builds a DateTimeFormat per call (~100µs, 42 per calendar render); reading the local fields in UTC keeps the cached one time-zone independent.
  let format = longDateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...LONG_DATE_OPTIONS, timeZone: 'UTC' });
    longDateFormats.set(locale, format);
  }
  const calendarDay = new Date(0);
  calendarDay.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return format.format(calendarDay);
}
