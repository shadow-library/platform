import { parseMinuteOfDay } from '@/lib/format';

import { formatDuration } from './labels';

const MINUTES_PER_DAY = 1440;

export interface ScheduleWindow {
  wakeMinute: number;
  sleepMinute: number;
}

export const MIN_SLEEP_MINUTES = 3 * 60;
export const MAX_SLEEP_MINUTES = 14 * 60;

/** A sleep time earlier on the clock than the wake time is after midnight, so 00:00 → 07:00 is seven hours. */
export function sleepMinutes(wakeMinute: number, sleepMinute: number): number {
  return (wakeMinute - sleepMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function sleepMinutesBetween(wakeTime: string, sleepTime: string): number {
  return sleepMinutes(parseMinuteOfDay(wakeTime), parseMinuteOfDay(sleepTime));
}

export function sleepWindowProblem(wakeTime: string, sleepTime: string): string | null {
  const sleep = sleepMinutesBetween(wakeTime, sleepTime);
  if (sleep === 0) return 'Sleep and wake time can’t be the same.';
  if (sleep < MIN_SLEEP_MINUTES) return `That leaves ${formatDuration(sleep)} of sleep. Allow at least ${formatDuration(MIN_SLEEP_MINUTES)}.`;
  if (sleep > MAX_SLEEP_MINUTES) return `That’s ${formatDuration(sleep)} of sleep. Allow at most ${formatDuration(MAX_SLEEP_MINUTES)}.`;
  return null;
}

/** Minutes until the day's sleep time; a sleep time after midnight keeps today's window open past the calendar day. */
export function minutesUntilSleep(nowMinute: number, wakeMinute: number, sleepMinute: number): number {
  if (sleepMinute > wakeMinute) return sleepMinute - nowMinute;
  return nowMinute < sleepMinute ? sleepMinute - nowMinute : sleepMinute + MINUTES_PER_DAY - nowMinute;
}
