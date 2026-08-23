import {
  type HealthMetricDefinition,
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
