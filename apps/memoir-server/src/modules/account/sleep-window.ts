const MINUTES_PER_DAY = 1440;

export const MIN_SLEEP_MINUTES = 3 * 60;
export const MAX_SLEEP_MINUTES = 14 * 60;

/** A sleep time earlier on the clock than the wake time is after midnight, so 00:00 → 07:00 is seven hours. */
export function sleepMinutes(scheduleStartMin: number, scheduleEndMin: number): number {
  return (scheduleStartMin - scheduleEndMin + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function isSleepWindowValid(scheduleStartMin: number, scheduleEndMin: number): boolean {
  const sleep = sleepMinutes(scheduleStartMin, scheduleEndMin);
  return sleep >= MIN_SLEEP_MINUTES && sleep <= MAX_SLEEP_MINUTES;
}
