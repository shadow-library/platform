import { addDays, DEFAULT_LOCALE, parseISODate, toISODate } from '@shadow-library/ui';

import { type OccurrenceState, type ReasonTag, type StatAffinity, type Strictness, type Weekday } from './quest.types';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export const STAT_LABELS: Record<StatAffinity, string> = { discipline: 'Discipline', body: 'Body', wealth: 'Wealth', mind: 'Mind' };

export const STRICTNESS_LABELS: Record<Strictness, string> = { anchor: 'Anchor', routine: 'Routine', goal: 'Goal', recovery: 'Recovery', optional: 'Optional' };

export const STRICTNESS_RULES: Record<Strictness, string> = {
  anchor: 'A fixed time, with thirty minutes of grace. A break spends 1 HP.',
  routine: 'A window the length of the quest. A break spends 1 HP.',
  goal: 'Judged on the day, not the hour. A break costs no HP.',
  recovery: 'Offered the day after a miss. It can never trigger another.',
  optional: 'Reward only. It can never cost HP or end a streak.',
};

export const STATE_LABELS: Record<OccurrenceState, string> = {
  completed: 'Kept',
  partial: 'Partial',
  skipped: 'Skipped',
  missed: 'Missed',
  late: 'Late',
  postponed: 'Postponed',
  rescheduled: 'Moved',
  recovery: 'Recovery',
  upcoming: 'Open',
};

export const REASON_TAGS: ReasonTag[] = [
  'forgot',
  'too_tired',
  'task_too_big',
  'schedule_conflict',
  'avoided_it',
  'emotional_resistance',
  'health',
  'travel',
  'family_social',
  'work_emergency',
  'not_important_anymore',
  'poorly_planned',
  'other',
];

export const REASON_LABELS: Record<ReasonTag, string> = {
  forgot: 'forgot',
  too_tired: 'too tired',
  task_too_big: 'task too big',
  schedule_conflict: 'schedule conflict',
  avoided_it: 'avoided it',
  emotional_resistance: 'emotional resistance',
  health: 'health',
  travel: 'travel',
  family_social: 'family or social',
  work_emergency: 'work emergency',
  not_important_anymore: 'not important anymore',
  poorly_planned: 'poorly planned',
  other: 'other',
};

export function toDate(value: string): Date {
  return parseISODate(value) ?? new Date(value);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[(toDate(date).getDay() + 6) % 7] as Weekday;
}

export function shiftDate(date: string, days: number): string {
  return toISODate(addDays(toDate(date), days));
}

export function startOfWeek(date: string): string {
  const parsed = toDate(date);
  return toISODate(addDays(parsed, -((parsed.getDay() + 6) % 7)));
}

export function formatTime(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatDayName(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatShortDate(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function formatMonth(date: string, locale: string = DEFAULT_LOCALE): string {
  return toDate(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function formatRange(from: string, to: string, locale: string = DEFAULT_LOCALE): string {
  const start = toDate(from);
  const end = toDate(to);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = sameMonth ? String(start.getDate()) : start.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return `${startLabel} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
