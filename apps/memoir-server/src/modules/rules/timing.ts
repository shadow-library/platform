import { type Ruleset, type Strictness, type TimingBand } from './rules.types';

export interface TimingBandInput {
  readonly strictness: Strictness;
  /** Null for an untimed quest, which has no within-day decay regardless of strictness. */
  readonly startMinute: number | null;
  readonly durationMinutes: number;
  /** Local calendar days between the occurrence's day and the day the completion resolved on. */
  readonly daysElapsed: number;
  /** Minute-of-day the completion resolved at, in the account's timezone. */
  readonly minuteOfDay: number;
}

const onTimeWindowEnd = (ruleset: Ruleset, input: TimingBandInput): number | null => {
  if (input.startMinute === null) return null;
  const { schedulingModel } = ruleset.strictness[input.strictness];
  if (schedulingModel === 'strict_time') return input.startMinute + ruleset.reward.timing.anchorGraceMinutes;
  if (schedulingModel === 'time_window') return input.startMinute + input.durationMinutes;
  return null;
};

/** Every strictness scores 0 XP at both `day_3` and `day_4`, so anything later than day+4 resolves to the terminal band. */
const dayBandFor = (daysElapsed: number): TimingBand => {
  if (daysElapsed >= 4) return 'day_4';
  if (daysElapsed === 3) return 'day_3';
  if (daysElapsed === 2) return 'day_2';
  return 'day_1';
};

export const resolveTimingBand = (ruleset: Ruleset, input: TimingBandInput): TimingBand => {
  const daysElapsed = Math.max(0, Math.trunc(input.daysElapsed));
  if (daysElapsed > 0) return dayBandFor(daysElapsed);

  const windowEnd = onTimeWindowEnd(ruleset, input);
  if (windowEnd === null || input.minuteOfDay < windowEnd) return 'on_time';
  return input.minuteOfDay - windowEnd < ruleset.reward.timing.lateStepMinutes ? 'late_0_2h' : 'late_2h_plus';
};
