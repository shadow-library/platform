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
  /** Client-minted UUIDv7 — the server takes the entry's permanent identity from the command rather than assigning one. Minted at dispatch when a caller leaves it out. */
  id?: string;
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
  /** Client-minted UUIDv7, as on {@link JournalDraft}. */
  id?: string;
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
  /** Client-minted UUIDv7, as on {@link JournalDraft}. */
  id?: string;
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

/** `metrics.name` as the server seeds the built-in health catalogue — the only join between a local key and the account's catalogue row id. */
export const HEALTH_METRIC_NAMES: Record<HealthMetricKey, string> = {
  steps: 'Steps',
  calories: 'Calories burned',
  sleep: 'Sleep duration',
  water: 'Water',
};

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
  /** The quest the offer would complete. Null while the offer is derived from the local metric catalogue rather than from a server-side threshold. */
  questId: string | null;
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

/**
 * The consent step PRD §2.6 requires around module-linked quests: a saved entry that could satisfy a
 * quest scheduled for the same day reports the quest, and the owner completes it — the log never does.
 */
export interface QuestLinkageOffer {
  status: 'offered' | 'already-completed';
  questId: string;
  questName: string;
  date: string;
}

export type QuickLogCommand =
  | { type: 'journal.save'; draft: JournalDraft }
  | { type: 'journal.dismissPrompt' }
  | { type: 'meal.log'; draft: MealDraft }
  | { type: 'meal.logPreset'; presetId: string; date: string; id?: string }
  | { type: 'meal.savePreset'; preset: Omit<MealPreset, 'id' | 'usageCount'> }
  | { type: 'weight.save'; date: string; kg: number; confirmedReplacement: boolean }
  | { type: 'sidequest.log'; draft: SideQuestDraft }
  /** `metricId` is the server's catalogue id for `key`, resolved at dispatch; without it the save stays local because no `metric.register` can address the metric. */
  | { type: 'health.save'; key: HealthMetricKey; date: string; value: number; metricId?: string }
  | { type: 'health.acceptOffer'; key: HealthMetricKey; date: string };

export interface QuickLogCommandResult {
  id: string;
  message: string;
  reward?: QuickLogReward;
  advisory?: EntryCapAdvisory;
  /** Set when a same-day weight already exists and the save was not confirmed. Nothing was written. */
  needsConfirmation?: { kind: 'weight-replace'; existing: WeightEntry };
  linkageOffer?: QuestLinkageOffer;
}
