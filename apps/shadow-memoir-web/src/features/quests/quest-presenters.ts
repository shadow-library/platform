import { formatTime, type OccurrenceState, type QuestOccurrence, type QuestSummary, STAT_LABELS, STATE_LABELS, STRICTNESS_LABELS } from '@/lib/data';

export type OutcomeTone = 'kept' | 'partial' | 'open' | 'closed';

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
    occurrence.threshold ? `${occurrence.threshold.current.toLocaleString()} of ${occurrence.threshold.target.toLocaleString()} ${occurrence.threshold.unit}` : null,
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
  return Math.min(100, Math.round((occurrence.threshold.current / occurrence.threshold.target) * 100));
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
