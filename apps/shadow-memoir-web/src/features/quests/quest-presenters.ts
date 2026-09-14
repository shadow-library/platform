import {
  formatMetricValue,
  formatShortDate,
  formatTime,
  HEALTH_METRICS,
  type HealthComparison,
  type HealthMetricDefinition,
  type HealthMetricKey,
  type HeroIntensityMode,
  type NthWeekdayOrdinal,
  type OccurrenceState,
  type Quest,
  type QuestOccurrence,
  type QuestProgress,
  type QuestSummary,
  type Recurrence,
  RESCHEDULE_WINDOW_DAYS,
  reschedulesCountedFor,
  shiftDate,
  STAT_LABELS,
  STATE_LABELS,
  type Strictness,
  STRICTNESS_LABELS,
  type Weekday,
  WEEKDAY_LABELS,
  WEEKDAY_LONG_LABELS,
  WEEKDAYS,
} from '@/lib/data';
import { formatCount } from '@/lib/format';

/** Only `strict_time`/`time_window` quests (anchor, routine) can be rescheduled — day-level strictness fails server-side `QST_008`. */
const RESCHEDULABLE_STRICTNESSES: readonly Strictness[] = ['anchor', 'routine'];

const HP_COSTING_STRICTNESSES: readonly Strictness[] = ['anchor', 'routine'];

const ORDINAL_LABELS: Record<NthWeekdayOrdinal, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', last: 'last' };

const WEEKDAY_RANGE_MIN = 3;

export type OutcomeTone = 'kept' | 'partial' | 'open' | 'closed';

export type StreakUnit = 'days' | 'occurrences';

const COMPARISON_SYMBOL: Record<HealthComparison, string> = { gte: '≥', lte: '≤' };

function metricDefinition(key: HealthMetricKey): HealthMetricDefinition {
  return HEALTH_METRICS.find(item => item.key === key) as HealthMetricDefinition;
}

/** e.g. "Steps ≥ 8,000" — `toHealthThreshold` already dropped anything that didn't resolve, so `metricKey` is always valid here. */
export function questThresholdLabel(threshold: NonNullable<Quest['healthThreshold']>): string {
  const definition = metricDefinition(threshold.metricKey);
  return `${definition.name} ${COMPARISON_SYMBOL[threshold.comparison]} ${formatMetricValue(threshold.value, definition)}`;
}

function thresholdProgressLabel(threshold: NonNullable<QuestOccurrence['threshold']>): string {
  const definition = metricDefinition(threshold.metricKey);
  return `${formatMetricValue(threshold.current, definition)} of ${formatMetricValue(threshold.target, definition)}`;
}

export function thresholdMetricName(metricKey: HealthMetricKey): string {
  return metricDefinition(metricKey).name;
}

export function outcomeTone(state: OccurrenceState): OutcomeTone {
  if (state === 'completed') return 'kept';
  if (state === 'partial' || state === 'recovery' || state === 'late') return 'partial';
  if (state === 'upcoming' || state === 'rescheduled') return 'open';
  return 'closed';
}

/** `rescheduled` only moves the time, never the outcome, so it stays completable — the occurrence isn't resolved. */
export function isResolved(state: OccurrenceState): boolean {
  return state !== 'upcoming' && state !== 'rescheduled';
}

export function occurrenceMeta(occurrence: QuestOccurrence): string {
  const time =
    occurrence.state === 'rescheduled' && occurrence.rescheduledToMin !== null ? `Moved to ${formatTime(occurrence.rescheduledToMin)}` : formatTime(occurrence.startTimeMinutes);
  const parts = [
    time,
    occurrence.xpAwarded > 0 ? `+${occurrence.xpAwarded} XP` : null,
    STAT_LABELS[occurrence.statAffinity],
    STRICTNESS_LABELS[occurrence.strictness],
    occurrence.streakDays > 0 ? `${occurrence.streakDays}-day streak` : null,
    occurrence.threshold ? thresholdProgressLabel(occurrence.threshold) : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function occurrenceCheckLabel(occurrence: QuestOccurrence): string {
  if (occurrence.state === 'completed') return `Completed: ${occurrence.questName}`;
  if (occurrence.state === 'partial') return `Partial: ${occurrence.questName}`;
  if (isResolved(occurrence.state)) return `${STATE_LABELS[occurrence.state]}: ${occurrence.questName}`;
  return `Mark complete: ${occurrence.questName}`;
}

export function thresholdPercent(occurrence: QuestOccurrence): number | null {
  if (!occurrence.threshold) return null;
  const { current, target } = occurrence.threshold;
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
}

export function weekdaySpan(days: readonly Weekday[]): string {
  const picked = WEEKDAYS.filter(day => days.includes(day));
  if (picked.length === WEEKDAYS.length) return 'Every day';
  const runs: Weekday[][] = [];
  for (const day of picked) {
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    if (run && previous && WEEKDAYS.indexOf(day) === WEEKDAYS.indexOf(previous) + 1) run.push(day);
    else runs.push([day]);
  }
  return runs
    .map(run =>
      run.length >= WEEKDAY_RANGE_MIN ? `${WEEKDAY_LABELS[run[0] as Weekday]}–${WEEKDAY_LABELS[run[run.length - 1] as Weekday]}` : run.map(day => WEEKDAY_LABELS[day]).join(', '),
    )
    .join(', ');
}

export function recurrenceSummary(recurrence: Recurrence): string {
  const { frequency, interval } = recurrence;
  if (frequency === 'daily') return interval > 1 ? `Every ${interval} days` : 'Every day';
  if (frequency === 'weekly') {
    const span = recurrence.daysOfWeek.length > 0 ? weekdaySpan(recurrence.daysOfWeek) : 'No days set';
    return interval > 1 ? `Every ${interval} weeks · ${span}` : span;
  }
  if (frequency === 'monthly') {
    const cadence = interval > 1 ? `Every ${interval} months` : 'Monthly';
    const { nthWeekday } = recurrence;
    if (nthWeekday) return `${cadence} on the ${ORDINAL_LABELS[nthWeekday.ordinal]} ${WEEKDAY_LONG_LABELS[nthWeekday.weekday]}`;
    const dayOfMonth = recurrence.dayOfMonth ?? Number(recurrence.startDate.slice(8));
    return dayOfMonth > 0 ? `${cadence} on day ${dayOfMonth}` : cadence;
  }
  return interval > 1 ? `Every ${interval} years` : 'Every year';
}

export function scheduleSummary(quest: Pick<Quest, 'recurrence' | 'startTimeMinutes'>): string {
  return `${recurrenceSummary(quest.recurrence)} · ${formatTime(quest.startTimeMinutes) ?? 'all day'}`;
}

export function streakUnit(recurrence: Recurrence): StreakUnit {
  return recurrence.frequency === 'daily' && recurrence.interval === 1 ? 'days' : 'occurrences';
}

function streakLabel(length: number, unit: StreakUnit): string {
  return unit === 'days' ? `${length}-day streak` : `${length}-occurrence streak`;
}

export function questMeta(summary: QuestSummary): string {
  const { quest, progress } = summary;
  const unit = streakUnit(quest.recurrence);
  const streak =
    progress.currentStreakDays > 0
      ? streakLabel(progress.currentStreakDays, unit)
      : progress.longestStreakDays > 0
        ? `longest ${streakLabel(progress.longestStreakDays, unit)}`
        : null;
  const parts = [scheduleSummary(quest), streak, progress.shields > 0 ? formatCount(progress.shields, 'shield', 'shields') : null, quest.active ? null : 'kept as history'];
  return parts.filter(Boolean).join(' · ');
}

export function adherenceLabel(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function alreadyRecordedReason(occurrence: QuestOccurrence): string | undefined {
  return isResolved(occurrence.state) ? `Already recorded as ${STATE_LABELS[occurrence.state].toLowerCase()}.` : undefined;
}

export function canReschedule(occurrence: QuestOccurrence): boolean {
  return occurrence.state === 'upcoming' && RESCHEDULABLE_STRICTNESSES.includes(occurrence.strictness);
}

export function rescheduleDisabledReason(occurrence: QuestOccurrence): string | undefined {
  if (!RESCHEDULABLE_STRICTNESSES.includes(occurrence.strictness)) return 'Reschedule doesn’t apply to this strictness.';
  if (occurrence.state === 'rescheduled') return 'Already moved once today.';
  return alreadyRecordedReason(occurrence);
}

/**
 * Server `rules/streak.ts#applyStreakEvent`: `recovery` never keeps a streak (`streakEligibility: 'never'`);
 * `optional` keeps one only when the owner opted in (`streakEligibility: 'opt_in'`) — `QuestOccurrence` doesn't
 * carry that flag yet, so an unknown opt-in status is read as opted in rather than silently promising safety
 * a not-opted-in quest doesn't have.
 */
export function breakStreakNote(strictness: Strictness, shields: number, optInIfKnown = true): string {
  const applies = strictness === 'recovery' ? false : strictness === 'optional' ? optInIfKnown : true;
  if (!applies) return 'Doesn’t touch a streak — this quest doesn’t keep one.';
  return shields > 0 ? 'A held shield bridges the break — the streak continues, but the shield is spent.' : 'Breaks the streak.';
}

/**
 * What server rollover charges at day close (`computeHp` → `rules/hp.ts#hpCostFor`): `anchor`/`routine` breaks only, 0 HP at gentle and
 * 1 HP otherwise, shield or not. Rollover passes `streakDaysBefore: 0`, so the ruleset's 2 HP for a demanding break ending a 7+ day
 * streak is never charged.
 */
export function breakCostNote(strictness: Strictness, intensity: HeroIntensityMode | null): string {
  if (!HP_COSTING_STRICTNESSES.includes(strictness)) return 'No HP is spent.';
  if (intensity === null) return 'May spend HP when the day closes, depending on your intensity.';
  if (intensity === 'gentle') return 'No HP is spent — gentle intensity.';
  return 'Spends 1 HP when the day closes.';
}

/** The server breaks a lock only on the open day, so a postpone on any other date leaves its plan as it is. */
export function lockBreakNote(occurrence: QuestOccurrence, today: string): string | null {
  return occurrence.locked && occurrence.date === today ? 'Postponing breaks today’s locked plan, so its lock bonus stops for every quest in it.' : null;
}

/** Reuses the server's counting formula (`quest.rules.ts#reschedulesCountedFor`) rather than re-deriving the cap window. */
export function rescheduleSummary(progress: QuestProgress, today: string): string {
  const counted = reschedulesCountedFor(progress.rescheduledDates, today);
  const used = counted.filter(date => date <= today);
  const ahead = counted.filter(date => date > today);
  const aheadNote = ahead.length > 0 ? ` · ${ahead.length} more booked ahead` : '';
  if (counted.length < progress.rescheduleCap) return `${used.length} of ${progress.rescheduleCap} used in the last 7 days${aheadNote}`;
  const freesUpFrom = shiftDate(counted[counted.length - progress.rescheduleCap] as string, RESCHEDULE_WINDOW_DAYS);
  return `Cap reached — frees up for occurrences from ${formatShortDate(freesUpFrom)}${aheadNote}`;
}
