import { shiftDate } from './labels';
import { type OccurrenceState } from './quest.types';

export const RESCHEDULE_WINDOW_DAYS = 7;

/** Outcomes that count as done in a day's tally; a partial is reported on its own. */
export const KEPT_STATES: readonly OccurrenceState[] = ['completed', 'late', 'recovery'];

/** The server's cap input for a reschedule of the occurrence on `anchorDate`: every reschedule of the quest dated within six days before it, or any day after it. */
export function reschedulesCountedFor(rescheduledDates: readonly string[], anchorDate: string): string[] {
  const windowStart = shiftDate(anchorDate, -(RESCHEDULE_WINDOW_DAYS - 1));
  return rescheduledDates.filter(date => date >= windowStart).sort();
}
