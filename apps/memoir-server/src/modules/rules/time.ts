export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** IANA zone identifier; the account's stored timezone is the sole day-boundary authority. */
export type TimeZone = string;

/** ISO-8601 weekday: Monday is 1, Sunday is 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type NthWeekdayOrdinal = 1 | 2 | 3 | 4 | 'last';

export interface ZonedFields {
  readonly date: LocalDate;
  readonly minuteOfDay: number;
  readonly second: number;
}

/** `ambiguous_earlier` picks the first of a repeated wall clock on a fall-back day; `gap_shifted` reports a spring-forward wall time that never happened. */
export type LocalMinuteResolution = 'exact' | 'ambiguous_earlier' | 'gap_shifted';

export interface ResolvedLocalMinute {
  readonly instant: number;
  readonly date: LocalDate;
  readonly minuteOfDay: number;
  readonly resolution: LocalMinuteResolution;
}

export type PerformedAtOutcome = 'within_window' | 'clamped_to_window_start' | 'clamped_to_server_now';

export interface PerformedAtInput {
  /** Client-claimed instant in epoch milliseconds; never an authority, always clamped. */
  readonly performedAt: number;
  readonly serverNow: number;
  readonly lastAckedSyncAt: number | null;
  readonly occurrenceDate: LocalDate;
  readonly timeZone: TimeZone;
}

export interface ClampedPerformedAt {
  readonly instant: number;
  readonly date: LocalDate;
  readonly minuteOfDay: number;
  /** Local days between the occurrence's date and the clamped instant's date — the timing band's day input. */
  readonly daysElapsed: number;
  readonly outcome: PerformedAtOutcome;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;
/** 1970-01-01 was a Thursday, so epoch day + 3 is Monday-anchored. */
const MONDAY_EPOCH_OFFSET = 3;
const MONTHS_PER_YEAR = 12;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const floorMod = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

export const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const daysInMonth = (year: number, month: number): number => (month === 2 && isLeapYear(year) ? 29 : (MONTH_LENGTHS[month - 1] ?? 30));

export const localDateOf = (year: number, month: number, day: number): LocalDate => ({ year, month, day });

export const clampToMonthEnd = (year: number, month: number, day: number): LocalDate => localDateOf(year, month, Math.min(day, daysInMonth(year, month)));

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const formatLocalDate = (date: LocalDate): string => `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseLocalDate = (value: string): LocalDate | null => {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > MONTHS_PER_YEAR || day < 1 || day > daysInMonth(year, month)) return null;
  return localDateOf(year, month, day);
};

export const epochDayOf = (date: LocalDate): number => Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY;

export const localDateFromEpochDay = (epochDay: number): LocalDate => {
  const instant = new Date(epochDay * MS_PER_DAY);
  return localDateOf(instant.getUTCFullYear(), instant.getUTCMonth() + 1, instant.getUTCDate());
};

export const addDays = (date: LocalDate, days: number): LocalDate => localDateFromEpochDay(epochDayOf(date) + days);

export const addMonths = (date: LocalDate, months: number): LocalDate => {
  const shifted = date.year * MONTHS_PER_YEAR + (date.month - 1) + months;
  return clampToMonthEnd(Math.floor(shifted / MONTHS_PER_YEAR), floorMod(shifted, MONTHS_PER_YEAR) + 1, date.day);
};

export const daysBetween = (from: LocalDate, to: LocalDate): number => epochDayOf(to) - epochDayOf(from);

export const compareLocalDates = (left: LocalDate, right: LocalDate): number => epochDayOf(left) - epochDayOf(right);

export const isSameLocalDate = (left: LocalDate, right: LocalDate): boolean => left.year === right.year && left.month === right.month && left.day === right.day;

export const monthIndexOf = (date: LocalDate): number => date.year * MONTHS_PER_YEAR + (date.month - 1);

const weekdayOfEpochDay = (epochDay: number): Weekday => (floorMod(epochDay + MONDAY_EPOCH_OFFSET, DAYS_PER_WEEK) + 1) as Weekday;

export const weekdayOf = (date: LocalDate): Weekday => weekdayOfEpochDay(epochDayOf(date));

/** Monotonic index of the Monday-anchored calendar week; differences are the week deltas weekly intervals count. */
export const mondayWeekIndexOf = (date: LocalDate): number => Math.floor((epochDayOf(date) + MONDAY_EPOCH_OFFSET) / DAYS_PER_WEEK);

export const startOfMondayWeek = (date: LocalDate): LocalDate => addDays(date, 1 - weekdayOf(date));

export const weeksBetween = (from: LocalDate, to: LocalDate): number => mondayWeekIndexOf(to) - mondayWeekIndexOf(from);

export const nthWeekdayOfMonth = (year: number, month: number, weekday: Weekday, ordinal: NthWeekdayOrdinal): LocalDate => {
  if (ordinal === 'last') {
    const lastDay = epochDayOf(localDateOf(year, month, daysInMonth(year, month)));
    return localDateFromEpochDay(lastDay - floorMod(weekdayOfEpochDay(lastDay) - weekday, DAYS_PER_WEEK));
  }
  const firstDay = epochDayOf(localDateOf(year, month, 1));
  return localDateFromEpochDay(firstDay + floorMod(weekday - weekdayOfEpochDay(firstDay), DAYS_PER_WEEK) + (ordinal - 1) * DAYS_PER_WEEK);
};

const formatters = new Map<TimeZone, Intl.DateTimeFormat>();

const formatterFor = (timeZone: TimeZone): Intl.DateTimeFormat => {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(timeZone, formatter);
  return formatter;
};

export const zonedFieldsAt = (instant: number, timeZone: TimeZone): ZonedFields => {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const field = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(part => part.type === type)?.value ?? 0);
  const hour = field('hour') % 24;
  return { date: localDateOf(field('year'), field('month'), field('day')), minuteOfDay: hour * MINUTES_PER_HOUR + field('minute'), second: field('second') };
};

export const localDateAt = (instant: number, timeZone: TimeZone): LocalDate => zonedFieldsAt(instant, timeZone).date;

export const minuteOfDayAt = (instant: number, timeZone: TimeZone): number => zonedFieldsAt(instant, timeZone).minuteOfDay;

const wallMillisOf = (fields: ZonedFields): number => epochDayOf(fields.date) * MS_PER_DAY + fields.minuteOfDay * MS_PER_MINUTE + fields.second * 1000;

export const offsetMinutesAt = (instant: number, timeZone: TimeZone): number =>
  (wallMillisOf(zonedFieldsAt(instant, timeZone)) - Math.floor(instant / 1000) * 1000) / MS_PER_MINUTE;

const firstInstantAtOrAfterWall = (low: number, high: number, wallMillis: number, timeZone: TimeZone): number => {
  let lower = low;
  let upper = high;
  while (lower < upper) {
    const mid = Math.floor((lower + upper) / 2);
    if (wallMillisOf(zonedFieldsAt(mid, timeZone)) >= wallMillis) upper = mid;
    else lower = mid + 1;
  }
  return lower;
};

/** Spring-forward policy (ARCHITECTURE §12.5): a wall time swallowed by the gap resolves to the first instant at or after it, i.e. the transition itself. */
export const instantAtLocalMinute = (date: LocalDate, minuteOfDay: number, timeZone: TimeZone): ResolvedLocalMinute => {
  const wallMillis = epochDayOf(date) * MS_PER_DAY + minuteOfDay * MS_PER_MINUTE;
  const before = wallMillis - offsetMinutesAt(wallMillis - MS_PER_DAY, timeZone) * MS_PER_MINUTE;
  const after = wallMillis - offsetMinutesAt(wallMillis + MS_PER_DAY, timeZone) * MS_PER_MINUTE;
  const [first, second] = [Math.min(before, after), Math.max(before, after)];
  const candidates = first === second ? [first] : [first, second];
  const valid = candidates.filter(candidate => wallMillisOf(zonedFieldsAt(candidate, timeZone)) === wallMillis);

  const matched = valid[0];
  if (matched !== undefined) return { instant: matched, date, minuteOfDay, resolution: valid.length > 1 ? 'ambiguous_earlier' : 'exact' };

  const instant = firstInstantAtOrAfterWall(first, second, wallMillis, timeZone);
  const fields = zonedFieldsAt(instant, timeZone);
  return { instant, date: fields.date, minuteOfDay: fields.minuteOfDay, resolution: 'gap_shifted' };
};

export const startOfLocalDay = (date: LocalDate, timeZone: TimeZone): number => instantAtLocalMinute(date, 0, timeZone).instant;

/** 1380 or 1500 on a transition day (1410 or 1470 in the half-hour zones), 1440 otherwise. */
export const localDayLengthMinutes = (date: LocalDate, timeZone: TimeZone): number =>
  (startOfLocalDay(addDays(date, 1), timeZone) - startOfLocalDay(date, timeZone)) / MS_PER_MINUTE;

export const clampPerformedAt = (input: PerformedAtInput): ClampedPerformedAt => {
  const upperBound = input.serverNow;
  const occurrenceStart = startOfLocalDay(input.occurrenceDate, input.timeZone);
  const lowerBound = Math.min(Math.max(occurrenceStart, input.lastAckedSyncAt ?? occurrenceStart), upperBound);

  const instant = Math.min(Math.max(input.performedAt, lowerBound), upperBound);
  const outcome: PerformedAtOutcome = input.performedAt < lowerBound ? 'clamped_to_window_start' : input.performedAt > upperBound ? 'clamped_to_server_now' : 'within_window';
  const fields = zonedFieldsAt(instant, input.timeZone);
  return { instant, date: fields.date, minuteOfDay: fields.minuteOfDay, daysElapsed: daysBetween(input.occurrenceDate, fields.date), outcome };
};
