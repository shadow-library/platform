import { type EntryCapAdvisory } from './entry-caps';
import { type StatAffinity } from './quest.types';

export type MoodValence = 1 | 2 | 3 | 4 | 5;

export interface MoodOption {
  value: MoodValence;
  label: string;
  glyph: string;
}

export const MOODS: MoodOption[] = [
  { value: 1, label: 'Low', glyph: '◌' },
  { value: 2, label: 'Flat', glyph: '◍' },
  { value: 3, label: 'Steady', glyph: '◉' },
  { value: 4, label: 'Good', glyph: '◈' },
  { value: 5, label: 'Bright', glyph: '✦' },
];

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  text: string;
  mood: MoodValence | null;
  tags: string[];
  wordCount: number;
  loggedAt: string;
  rewarded: boolean;
}

export interface JournalDraft {
  date: string;
  text: string;
  mood: MoodValence | null;
  tags?: string[];
}

export interface JournalPrompt {
  id: string;
  question: string;
}

export interface DayValue {
  date: string;
  value: number | null;
}

export interface JournalView {
  today: JournalEntry | null;
  prompt: JournalPrompt | null;
  entries: JournalEntry[];
  totalEntries: number;
  writingStreakDays: number;
  last28Days: DayValue[];
  moodTrend: DayValue[];
  moodNote: string;
  onThisDay: { year: number; excerpt: string } | null;
  draftNote: string;
}

export type MealType = 'cooked' | 'ate_out';

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  cooked: 'Cooked',
  ate_out: 'Ate out',
};

export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealPreset extends Macros {
  id: string;
  name: string;
  calories: number;
  mealType: MealType;
  note?: string;
  usageCount: number;
}

export interface Meal extends Macros {
  id: string;
  date: string;
  name: string;
  calories: number;
  mealType: MealType;
  note?: string;
  loggedAt: string;
  rewarded: boolean;
  /** Kept for provenance only — the values above are snapshotted, so editing the preset never rewrites a meal. */
  presetId?: string;
  sourceLabel: string;
}

export interface MealDraft {
  date: string;
  name: string;
  calories: number;
  mealType: MealType;
  note?: string;
}

export interface MealDayHistory {
  date: string;
  summary: string;
  calories: number | null;
}

export interface MealsView {
  date: string;
  meals: Meal[];
  presets: MealPreset[];
  totalCalories: number;
  macros: Macros;
  last14Days: DayValue[];
  averageCalories: number;
  history: MealDayHistory[];
  firstOfDayRewarded: boolean;
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
  note?: string;
  loggedAt: string;
  rewarded: boolean;
  replacedKg?: number;
}

export interface WeightView {
  today: WeightEntry | null;
  entries: WeightEntry[];
  trend: DayValue[];
  sevenDayAverageKg: number | null;
  ninetyDayChangeKg: number | null;
  ninetyDayStartKg: number | null;
  trendNote: string;
  context: string[];
}

export interface SideQuest {
  id: string;
  date: string;
  name: string;
  statAffinity: StatAffinity;
  xpAwarded: number;
  coinsAwarded: number;
  statTicked: boolean;
  rewarded: boolean;
  loggedAt: string;
  meta: string;
}

export interface SideQuestDraft {
  date: string;
  name: string;
  statAffinity: StatAffinity;
}

export interface SideQuestsView {
  items: SideQuest[];
  totalLogged: number;
  loggedThisWeek: number;
  rewardedToday: number;
  xpThisMonth: number;
  loggedThisMonth: number;
  patternHint: { name: string; occurrences: number } | null;
}

export type HealthMetricKey = 'steps' | 'calories' | 'sleep' | 'water';

export interface HealthMetricDefinition {
  key: HealthMetricKey;
  name: string;
  unit: string;
  step: number;
  precision: number;
  /** Manual entry only — a metric with no threshold is context, never a target. */
  threshold: { value: number; questTitle: string | null; xp: number } | null;
}

export interface HealthMetricEntry {
  key: HealthMetricKey;
  date: string;
  value: number;
  loggedAt: string;
  replacedValue: number | null;
  source: 'manual' | 'health';
}

/**
 * The consent step the PRD requires: a met threshold produces an offer the owner accepts, never a quest
 * the app completes on their behalf.
 */
export interface ThresholdOffer {
  metricKey: HealthMetricKey;
  questTitle: string;
  thresholdValue: number;
  currentValue: number;
  ratio: number;
  met: boolean;
  xp: number;
  note: string;
}

export interface HealthMetricState {
  definition: HealthMetricDefinition;
  entry: HealthMetricEntry | null;
  meta: string;
  trendLabel: string;
  last14Days: DayValue[];
  offer: ThresholdOffer | null;
}

export interface HealthMetricHistoryRow {
  date: string;
  text: string;
  badge: string | null;
}

export interface HealthView {
  date: string;
  metrics: HealthMetricState[];
  history: HealthMetricHistoryRow[];
  thresholds: { label: string }[];
}

export interface QuickLogReward {
  xp: number;
  coins: number;
  statTicked: boolean;
  rewarded: boolean;
  reason: string;
}

export type QuickLogCommand =
  | { type: 'journal.save'; draft: JournalDraft }
  | { type: 'journal.dismissPrompt' }
  | { type: 'meal.log'; draft: MealDraft }
  | { type: 'meal.logPreset'; presetId: string; date: string }
  | { type: 'meal.savePreset'; preset: Omit<MealPreset, 'id' | 'usageCount'> }
  | { type: 'weight.save'; date: string; kg: number; confirmedReplacement: boolean }
  | { type: 'sidequest.log'; draft: SideQuestDraft }
  | { type: 'health.save'; key: HealthMetricKey; date: string; value: number }
  | { type: 'health.acceptOffer'; key: HealthMetricKey; date: string };

export interface QuickLogCommandResult {
  id: string;
  message: string;
  reward?: QuickLogReward;
  advisory?: EntryCapAdvisory;
  /** Set when a same-day weight already exists and the save was not confirmed. Nothing was written. */
  needsConfirmation?: { kind: 'weight-replace'; existing: WeightEntry };
}
