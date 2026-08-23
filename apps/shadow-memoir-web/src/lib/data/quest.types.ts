export type StatAffinity = 'discipline' | 'body' | 'wealth' | 'mind';

export type Strictness = 'anchor' | 'routine' | 'goal' | 'recovery' | 'optional';

/** `upcoming` is display-only — it is never a persisted quest-log state (PRD §3.3). */
export type QuestLogState = 'completed' | 'partial' | 'skipped' | 'missed' | 'late' | 'postponed' | 'rescheduled' | 'recovery';

export type OccurrenceState = QuestLogState | 'upcoming';

export type ReasonTag =
  | 'forgot'
  | 'too_tired'
  | 'task_too_big'
  | 'schedule_conflict'
  | 'avoided_it'
  | 'emotional_resistance'
  | 'health'
  | 'travel'
  | 'family_social'
  | 'work_emergency'
  | 'not_important_anymore'
  | 'poorly_planned'
  | 'other';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurrenceEnd = { kind: 'never' } | { kind: 'count'; count: number } | { kind: 'until'; date: string };

export interface Recurrence {
  frequency: RecurrenceFrequency;
  /** Every N units of `frequency`; weekly intervals count Monday-anchored calendar weeks. */
  interval: number;
  daysOfWeek: Weekday[];
  /** Clamped to the month length, so "the 31st" lands on the last day of shorter months. */
  dayOfMonth: number | null;
  startDate: string;
  end: RecurrenceEnd;
  exceptions: string[];
}

export type PartialMode = 'scaled' | 'actual' | 'none';

export interface QuestConsequence {
  metric: string;
  fullValue: number;
  unit: string | null;
  partialMode: PartialMode;
}

export type ModuleLink = 'journal' | 'meal' | 'weight';

export interface HealthThreshold {
  metric: string;
  target: number;
  unit: string;
}

export interface QuestNotification {
  enabled: boolean;
  leadMinutes: number;
}

export interface Quest {
  id: string;
  name: string;
  notes: string | null;
  /** Null means untimed — the occurrence is judged on the day, not the hour. Required for Anchor. */
  startTimeMinutes: number | null;
  durationMinutes: number;
  statAffinity: StatAffinity;
  strictness: Strictness;
  optionalStreakOptIn: boolean;
  recurrence: Recurrence;
  consequences: QuestConsequence[];
  moduleLink: ModuleLink | null;
  notification: QuestNotification;
  healthThreshold: HealthThreshold | null;
  preCommit: boolean;
  /** Deletion is soft — historical logs reference the quest, so it is only ever deactivated. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QuestDraft = Omit<Quest, 'id' | 'createdAt' | 'updatedAt'>;

export interface QuestProgress {
  currentStreakDays: number;
  longestStreakDays: number;
  shields: number;
  /** Share of scheduled occurrences kept over the trailing 30 days, 0–1. */
  adherence30d: number | null;
  xpEarned: number;
  reschedulesUsed: number;
  rescheduleCap: number;
  /** Oldest first, one entry per day over the trailing 30 days. */
  recentOutcomes: OccurrenceState[];
}

export interface QuestSummary {
  quest: Quest;
  progress: QuestProgress;
  /** The plan is committed for the current week, so schedule and strictness are read-only. */
  scheduleLocked: boolean;
  scheduleSummary: string;
}

export interface ThresholdReading {
  metric: string;
  unit: string;
  target: number;
  current: number;
}

export interface PartialProgress {
  value: number;
  target: number;
  unit: string;
}

export interface QuestOccurrence {
  id: string;
  questId: string;
  questName: string;
  date: string;
  statAffinity: StatAffinity;
  strictness: Strictness;
  startTimeMinutes: number | null;
  durationMinutes: number;
  state: OccurrenceState;
  xpAwarded: number;
  coinsAwarded: number;
  reasonTag: ReasonTag | null;
  reasonNote: string | null;
  rescheduledToMin: number | null;
  postponedTo: string | null;
  streakDays: number;
  shields: number;
  locked: boolean;
  queued: boolean;
  threshold: ThresholdReading | null;
  /** The scale a partial is measured on, in the quest's own units — pages, kilometres, minutes. */
  partialTarget: PartialProgress | null;
}

export interface QuestLogEntry {
  date: string;
  state: QuestLogState;
  note: string;
}

export interface QuestDetail extends QuestSummary {
  todayOccurrence: QuestOccurrence | null;
  history: QuestLogEntry[];
  loadShare: number;
  loadSummary: string;
}
