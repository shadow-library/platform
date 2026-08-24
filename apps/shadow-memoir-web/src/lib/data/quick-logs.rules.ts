import { type CurrencyCode, type Expense } from './finance.types';
import { formatMinor } from './finance.rules';
import { type QuickLogTile } from './view.types';
import {
  type HealthMetricDefinition,
  type HealthMetricEntry,
  type HealthMetricKey,
  type JournalEntry,
  type Meal,
  type MealPreset,
  type MoodOption,
  MOODS,
  type MoodValence,
  type QuickLogReward,
  type SideQuest,
  type ThresholdOffer,
  type WeightEntry,
} from './quick-logs.types';

export const HEALTH_METRICS: HealthMetricDefinition[] = [
  { key: 'steps', name: 'Steps', unit: '', step: 100, precision: 0, threshold: { value: 8000, questTitle: 'Move 8,000 steps', xp: 30 } },
  { key: 'calories', name: 'Calories burned', unit: 'kcal', step: 10, precision: 0, threshold: null },
  { key: 'sleep', name: 'Sleep', unit: 'h', step: 0.1, precision: 1, threshold: { value: 7, questTitle: null, xp: 0 } },
  { key: 'water', name: 'Water', unit: 'l', step: 0.1, precision: 1, threshold: { value: 2, questTitle: 'Drink 2 litres', xp: 20 } },
];

export const SIDE_QUEST_DAILY_REWARD_LIMIT = 3;

export const QUICK_LOG_REWARDS = {
  journal: { xp: 5, coins: 0, statTicked: false },
  meal: { xp: 3, coins: 0, statTicked: false },
  weight: { xp: 3, coins: 0, statTicked: false },
  sideQuest: { xp: 8, coins: 1, statTicked: true },
} as const;

export function moodOption(mood: MoodValence | null): MoodOption | null {
  return mood === null ? null : (MOODS.find(option => option.value === mood) ?? null);
}

export function journalWordCount(text: string): number {
  const words = markdownLitePlainText(text).trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Markdown-lite is the whole vocabulary: bold, italic, headings, bullets and quotes. Nothing else is read. */
export function markdownLitePlainText(text: string): string {
  return text
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}#{1,3}\s+/gm, '')
    .replace(/^\s{0,3}[-*]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/\s+/g, ' ');
}

export function journalExcerpt(text: string, maxChars = 160): string {
  const plain = markdownLitePlainText(text).trim();
  return plain.length <= maxChars ? plain : `${plain.slice(0, maxChars).trimEnd()}…`;
}

export type MarkdownTool = 'bold' | 'italic' | 'quote' | 'list' | 'heading';

export interface MarkdownEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAPPERS: Partial<Record<MarkdownTool, string>> = { bold: '**', italic: '_' };
const PREFIXES: Partial<Record<MarkdownTool, string>> = { quote: '> ', list: '- ', heading: '## ' };

export function applyMarkdownTool(text: string, selectionStart: number, selectionEnd: number, tool: MarkdownTool): MarkdownEdit {
  const wrapper = WRAPPERS[tool];
  if (wrapper) {
    const selected = text.slice(selectionStart, selectionEnd);
    const next = `${text.slice(0, selectionStart)}${wrapper}${selected}${wrapper}${text.slice(selectionEnd)}`;
    return { text: next, selectionStart: selectionStart + wrapper.length, selectionEnd: selectionEnd + wrapper.length };
  }

  const prefix = PREFIXES[tool] ?? '';
  const lineStart = text.lastIndexOf('\n', Math.max(selectionStart - 1, 0)) + 1;
  const next = `${text.slice(0, lineStart)}${prefix}${text.slice(lineStart)}`;
  return { text: next, selectionStart: selectionStart + prefix.length, selectionEnd: selectionEnd + prefix.length };
}

/**
 * The meal keeps a copy of the preset's numbers, not a pointer to them: PRD §3.9 requires a later edit of
 * the preset to leave every already-logged meal untouched.
 */
export function snapshotPresetToMeal(preset: MealPreset, context: { id: string; date: string; loggedAt: string; rewarded: boolean }): Meal {
  return {
    id: context.id,
    date: context.date,
    name: preset.name,
    calories: preset.calories,
    mealType: preset.mealType,
    note: preset.note,
    proteinG: preset.proteinG,
    carbsG: preset.carbsG,
    fatG: preset.fatG,
    loggedAt: context.loggedAt,
    rewarded: context.rewarded,
    presetId: preset.id,
    sourceLabel: 'Preset',
  };
}

export function isFirstOfDay(entries: { date: string }[], date: string): boolean {
  return !entries.some(entry => entry.date === date);
}

export function sameDayWeight(entries: WeightEntry[], date: string): WeightEntry | null {
  return entries.find(entry => entry.date === date) ?? null;
}

export function rewardedSideQuestsOn(sideQuests: SideQuest[], date: string): number {
  return sideQuests.filter(sideQuest => sideQuest.date === date && sideQuest.rewarded).length;
}

export function nextSideQuestReward(rewardedToday: number): QuickLogReward {
  if (rewardedToday >= SIDE_QUEST_DAILY_REWARD_LIMIT)
    return { xp: 0, coins: 0, statTicked: false, rewarded: false, reason: `Logged. The first ${SIDE_QUEST_DAILY_REWARD_LIMIT} side quests a day carry the reward.` };
  const { xp, coins, statTicked } = QUICK_LOG_REWARDS.sideQuest;
  return { xp, coins, statTicked, rewarded: true, reason: 'Logged' };
}

export function firstOfDayReward(kind: 'journal' | 'meal' | 'weight', alreadyLogged: boolean): QuickLogReward {
  if (alreadyLogged) return { xp: 0, coins: 0, statTicked: false, rewarded: false, reason: 'Logged. Today already carries its reward.' };
  const { xp, coins, statTicked } = QUICK_LOG_REWARDS[kind];
  return { xp, coins, statTicked, rewarded: true, reason: 'First of the day' };
}

export function deriveThresholdOffer(definition: HealthMetricDefinition, value: number | null): ThresholdOffer | null {
  const { threshold } = definition;
  if (!threshold || threshold.questTitle === null || value === null) return null;

  const ratio = threshold.value > 0 ? Math.min(value / threshold.value, 1) : 0;
  const met = value >= threshold.value;
  const shortfall = Math.max(threshold.value - value, 0);
  return {
    metricKey: definition.key,
    questId: null,
    questTitle: threshold.questTitle,
    thresholdValue: threshold.value,
    currentValue: value,
    ratio,
    met,
    xp: threshold.xp,
    note: met
      ? `Threshold ${formatMetricValue(threshold.value, definition)} reached — the quest is waiting for you.`
      : `${formatMetricValue(shortfall, definition)} short of ${threshold.questTitle}.`,
  };
}

export function formatMetricValue(value: number, definition: HealthMetricDefinition): string {
  const formatted = definition.precision > 0 ? value.toFixed(definition.precision) : Math.round(value).toLocaleString('en-US');
  return definition.unit ? `${formatted} ${definition.unit}` : formatted;
}

export interface QuickLogTileSource {
  date: string;
  currency: CurrencyCode;
  expenses: Expense[];
  meals: Meal[];
  metrics: HealthMetricEntry[];
  weights: WeightEntry[];
  journal: JournalEntry[];
}

/** Blank, not zero: a day with nothing logged says so rather than showing a total the owner never recorded. */
const NOTHING_LOGGED = 'not yet';

function metricTile(source: QuickLogTileSource, key: HealthMetricKey): string {
  const definition = HEALTH_METRICS.find(item => item.key === key) as HealthMetricDefinition;
  const entry = source.metrics.find(item => item.key === key && item.date === source.date);
  return entry ? formatMetricValue(entry.value, definition) : NOTHING_LOGGED;
}

/** The Today rail's six counters, over whatever the owner has actually logged on `date`. */
export function quickLogTiles(source: QuickLogTileSource): QuickLogTile[] {
  const spentMinor = source.expenses
    .filter(expense => expense.occurredOnDate === source.date)
    .reduce((total, expense) => total + (expense.homeAmountMinor ?? expense.amountMinor), 0);
  const spent = source.expenses.some(expense => expense.occurredOnDate === source.date);
  const calories = source.meals.filter(meal => meal.date === source.date).reduce((total, meal) => total + meal.calories, 0);
  const meals = source.meals.some(meal => meal.date === source.date);
  const weight = source.weights.find(entry => entry.date === source.date);
  const journal = source.journal.find(entry => entry.date === source.date);

  return [
    { id: 'expense', label: 'Expense', value: spent ? `${formatMinor(spentMinor, source.currency)} today` : NOTHING_LOGGED, to: '/finance' },
    { id: 'meal', label: 'Meal', value: meals ? `${calories.toLocaleString('en-US')} kcal` : NOTHING_LOGGED, to: '/log' },
    { id: 'steps', label: 'Steps', value: metricTile(source, 'steps'), to: '/log' },
    { id: 'water', label: 'Water', value: metricTile(source, 'water'), to: '/log' },
    { id: 'weight', label: 'Weight', value: weight ? `${weight.kg.toFixed(1)} kg` : NOTHING_LOGGED, to: '/log' },
    { id: 'journal', label: 'Journal', value: journal ? `${journal.wordCount} words` : NOTHING_LOGGED, to: '/log' },
  ];
}

export function kgToLb(kg: number): number {
  return kg * 2.20462262;
}

export function lbToKg(lb: number): number {
  return lb / 2.20462262;
}

export function averageOf(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}
