import {
  formatMetricValue,
  formatTime,
  HEALTH_METRICS,
  type HealthComparison,
  type HealthMetricDefinition,
  type HealthMetricKey,
  type OccurrenceState,
  type Quest,
  type QuestOccurrence,
  type QuestSummary,
  STAT_LABELS,
  STATE_LABELS,
  STRICTNESS_LABELS,
} from '@/lib/data';

export type OutcomeTone = 'kept' | 'partial' | 'open' | 'closed';

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
  if (state === 'upcoming') return 'open';
  return 'closed';
}

export function isResolved(state: OccurrenceState): boolean {
  return state !== 'upcoming';
}

export function occurrenceMeta(occurrence: QuestOccurrence): string {
  const parts = [
    formatTime(occurrence.startTimeMinutes),
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

export function questMeta(summary: QuestSummary): string {
  const parts = [
    summary.scheduleSummary,
    summary.progress.currentStreakDays > 0 ? `${summary.progress.currentStreakDays}-day streak` : `longest ${summary.progress.longestStreakDays}`,
    summary.progress.shields > 0 ? `${summary.progress.shields} shields` : null,
    summary.quest.active ? null : 'kept as history',
  ];
  return parts.filter(Boolean).join(' · ');
}

export function adherenceLabel(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
