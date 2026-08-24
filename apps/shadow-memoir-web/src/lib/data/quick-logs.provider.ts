import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addDays, toISODate } from '@shadow-library/ui';

import { deriveCapAdvisory } from './entry-caps';
import {
  averageOf,
  deriveThresholdOffer,
  firstOfDayReward,
  HEALTH_METRICS,
  isFirstOfDay,
  journalExcerpt,
  journalWordCount,
  nextSideQuestReward,
  rewardedSideQuestsOn,
  sameDayWeight,
  snapshotPresetToMeal,
} from './quick-logs.rules';
import {
  type DayValue,
  type HealthMetricEntry,
  type HealthMetricKey,
  type HealthView,
  type JournalDraft,
  type JournalEntry,
  type JournalView,
  type Meal,
  type MealPreset,
  type MealsView,
  type QuestLinkageOffer,
  type QuickLogCommand,
  type QuickLogCommandResult,
  type SideQuest,
  type SideQuestDraft,
  type SideQuestsView,
  type WeightEntry,
  type WeightView,
} from './quick-logs.types';

export interface QuickLogProvider {
  journal(): Promise<JournalView>;
  meals(date: string): Promise<MealsView>;
  weight(): Promise<WeightView>;
  health(date: string): Promise<HealthView>;
  sideQuests(): Promise<SideQuestsView>;
  dispatchCommand(command: QuickLogCommand): Promise<QuickLogCommandResult>;
}

function today(): string {
  return toISODate(new Date());
}

function shiftDays(days: number): string {
  return toISODate(addDays(new Date(), days));
}

function at(days: number, time: string): string {
  return `${shiftDays(days)}T${time}:00`;
}

function wave(index: number, seed: number, base: number, spread: number): number {
  return Math.round(base + Math.abs(Math.sin((index + seed) * 1.7)) * spread);
}

function series(count: number, seed: number, base: number, spread: number, blanks: number[] = []): DayValue[] {
  return Array.from({ length: count }, (_, index) => ({
    date: shiftDays(index - count + 1),
    value: blanks.includes(index) ? null : wave(index, seed, base, spread),
  }));
}

/** The whole of what a quick-log provider holds. The fixtures seed it; the sync layer projects it from delta rows — {@link applyQuickLogCommand} is shared by both. */
export interface QuickLogState {
  journal: JournalEntry[];
  promptDismissed: boolean;
  meals: Meal[];
  presets: MealPreset[];
  weights: WeightEntry[];
  sideQuests: SideQuest[];
  metrics: HealthMetricEntry[];
  monthlyCounts: Record<'journal' | 'meals' | 'weight' | 'sidequests', number>;
}

function seedJournal(): JournalEntry[] {
  const entries: [number, string, string, 1 | 2 | 3 | 4 | 5, string][] = [
    [-1, 'Friday', 'Skipped the stretch and knew I would. Wrote anyway, which is the part that has held for a month.', 2, '112'],
    [-2, 'Thursday', 'Heaviest day of the week and it went fine. **Strength session** felt easier than the numbers suggest.', 3, '240'],
    [-3, 'Wednesday', 'Bought the shoes. Wore them straight out of the shop and ran the long way home.', 4, '88'],
    [-4, 'Tuesday', 'Ate out and logged it honestly. The quest said no takeaway; I said yes.\n\n> Writing it down is the whole mechanism.', 1, '304'],
    [-5, 'Monday', 'New week, locked the plan on Sunday night so there was nothing to decide at six in the morning.', 3, '156'],
  ];

  return entries.map(([offset, title, text, mood]) => ({
    id: `journal${offset}`,
    date: shiftDays(offset),
    title,
    text,
    mood,
    tags: [],
    wordCount: journalWordCount(text),
    loggedAt: at(offset, '21:40'),
    rewarded: true,
  }));
}

function seedPresets(): MealPreset[] {
  return [
    { id: 'preset-oats', name: 'Breakfast oats', calories: 410, mealType: 'cooked', proteinG: 24, carbsG: 58, fatG: 9, usageCount: 84 },
    { id: 'preset-salmon', name: 'Salmon dinner', calories: 620, mealType: 'cooked', proteinG: 44, carbsG: 52, fatG: 24, usageCount: 31 },
    { id: 'preset-shake', name: 'Post-run shake', calories: 240, mealType: 'cooked', proteinG: 30, carbsG: 18, fatG: 4, usageCount: 26 },
    { id: 'preset-lunch', name: 'Work lunch', calories: 580, mealType: 'ate_out', proteinG: 32, carbsG: 61, fatG: 20, usageCount: 19 },
    { id: 'preset-eggs', name: 'Weekend eggs', calories: 380, mealType: 'cooked', proteinG: 26, carbsG: 12, fatG: 26, usageCount: 11 },
  ];
}

function seedMeals(): Meal[] {
  return [
    {
      id: 'meal-1',
      date: today(),
      name: 'Oats, berries, skyr',
      calories: 410,
      mealType: 'cooked',
      proteinG: 24,
      carbsG: 58,
      fatG: 9,
      loggedAt: at(0, '07:20'),
      rewarded: true,
      presetId: 'preset-oats',
      sourceLabel: 'Preset',
    },
    {
      id: 'meal-2',
      date: today(),
      name: 'Chicken salad and bread',
      calories: 620,
      mealType: 'ate_out',
      proteinG: 41,
      carbsG: 54,
      fatG: 22,
      loggedAt: at(0, '12:40'),
      rewarded: false,
      sourceLabel: 'Typed',
    },
    {
      id: 'meal-3',
      date: today(),
      name: 'Apple and almonds',
      calories: 210,
      mealType: 'cooked',
      proteinG: 6,
      carbsG: 24,
      fatG: 12,
      loggedAt: at(0, '16:10'),
      rewarded: false,
      sourceLabel: 'Quick capture',
    },
    {
      id: 'meal-4',
      date: today(),
      name: 'Salmon, rice, broccoli',
      calories: 620,
      mealType: 'cooked',
      proteinG: 44,
      carbsG: 52,
      fatG: 24,
      loggedAt: at(0, '19:30'),
      rewarded: false,
      presetId: 'preset-salmon',
      sourceLabel: 'Preset',
    },
  ];
}

function seedWeights(): WeightEntry[] {
  const values: [number, number, string][] = [
    [0, 78.4, 'Replaced 78.9 logged at 06:58 on the web'],
    [-1, 78.9, ''],
    [-2, 78.7, ''],
    [-3, 79.1, 'Corrected from 89.1 — typo'],
    [-5, 79.0, 'No entry the day before'],
    [-6, 79.2, ''],
  ];
  return values.map(([offset, kg, note]) => ({ id: `weight${offset}`, date: shiftDays(offset), kg, note: note || undefined, loggedAt: at(offset, '07:05'), rewarded: true }));
}

function seedSideQuests(): SideQuest[] {
  const items: [number, string, SideQuest['statAffinity'], string][] = [
    [-1, 'Fixed the bike light', 'discipline', 'Yesterday 18:40'],
    [-3, 'Tidied the workshop', 'discipline', 'Fourth time this month'],
    [-4, 'Called Mum', 'mind', ''],
    [-6, 'Cancelled an unused subscription', 'wealth', 'Saved €7.99 a month'],
    [-7, 'Swam in the fjord', 'body', ''],
    [-9, 'Helped a neighbour move a sofa', 'body', ''],
    [-12, 'Finished the tax paperwork', 'wealth', ''],
  ];
  return items.map(([offset, name, statAffinity, meta]) => ({
    id: `sq${offset}`,
    date: shiftDays(offset),
    name,
    statAffinity,
    xpAwarded: statAffinity === 'wealth' ? 8 : 8,
    coinsAwarded: 1,
    statTicked: true,
    rewarded: true,
    loggedAt: at(offset, '18:40'),
    meta: meta || shiftDays(offset),
  }));
}

function seedMetrics(): HealthMetricEntry[] {
  return [
    { key: 'steps', date: today(), value: 8310, loggedAt: at(0, '19:02'), replacedValue: 6240, source: 'manual' },
    { key: 'calories', date: today(), value: 620, loggedAt: at(0, '19:02'), replacedValue: null, source: 'manual' },
    { key: 'sleep', date: today(), value: 7.2, loggedAt: at(0, '06:45'), replacedValue: null, source: 'manual' },
    { key: 'water', date: today(), value: 1.4, loggedAt: at(0, '17:30'), replacedValue: null, source: 'manual' },
    { key: 'steps', date: shiftDays(-1), value: 6910, loggedAt: at(-1, '22:00'), replacedValue: null, source: 'manual' },
    { key: 'calories', date: shiftDays(-1), value: 480, loggedAt: at(-1, '22:00'), replacedValue: null, source: 'manual' },
  ];
}

function createState(): QuickLogState {
  return {
    journal: seedJournal(),
    promptDismissed: false,
    meals: seedMeals(),
    presets: seedPresets(),
    weights: seedWeights(),
    sideQuests: seedSideQuests(),
    metrics: seedMetrics(),
    monthlyCounts: { journal: 26, meals: 81, weight: 21, sidequests: 12 },
  };
}

const METRIC_SERIES: Record<HealthMetricKey, DayValue[]> = {
  steps: series(14, 2, 4200, 6000),
  calories: series(14, 5, 320, 480),
  sleep: series(14, 8, 6, 3),
  water: series(14, 3, 1, 1.6),
};

const METRIC_TRENDS: Record<HealthMetricKey, string> = {
  steps: 'average 7,240',
  calories: 'average 540 kcal',
  sleep: 'average 7h 10m',
  water: 'average 1.9 l',
};

export class FixtureQuickLogProvider implements QuickLogProvider {
  private state = createState();

  async journal(): Promise<JournalView> {
    const todaysEntry = this.state.journal.find(entry => entry.date === today()) ?? null;
    return {
      today: todaysEntry,
      prompt: this.state.promptDismissed ? null : { id: 'prompt-unexpected', question: 'What did today ask of you that you did not expect?' },
      entries: [...this.state.journal].sort((a, b) => (a.date < b.date ? 1 : -1)),
      totalEntries: 184,
      writingStreakDays: 31,
      last28Days: series(28, 1, 60, 140, [4, 11]),
      moodTrend: series(23, 4, 14, 40),
      moodNote: 'Steadier than the month before. The two lowest days were both Mondays after a missed weekend quest.',
      onThisDay: { year: new Date().getFullYear() - 1, excerpt: 'First run in three weeks. Slow, and it did not matter.' },
      draftNote: 'Autosaves as you write',
    };
  }

  async meals(date: string): Promise<MealsView> {
    const meals = this.state.meals.filter(meal => meal.date === date).sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1));
    const macros = meals.reduce((total, meal) => ({ proteinG: total.proteinG + meal.proteinG, carbsG: total.carbsG + meal.carbsG, fatG: total.fatG + meal.fatG }), {
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
    const last14Days = series(14, 2, 1400, 900, [9]);

    return {
      date,
      meals,
      presets: [...this.state.presets].sort((a, b) => b.usageCount - a.usageCount),
      totalCalories: meals.reduce((total, meal) => total + meal.calories, 0),
      macros,
      last14Days,
      averageCalories: Math.round(averageOf(last14Days.map(day => day.value)) ?? 0),
      history: [
        { date: shiftDays(-1), summary: '4 meals · protein 104 g', calories: 2010 },
        { date: shiftDays(-2), summary: '3 meals · one not logged', calories: 1740 },
        { date: shiftDays(-3), summary: '4 meals · dinner out', calories: 2380 },
        { date: shiftDays(-4), summary: 'Nothing logged — blank, not zero', calories: null },
      ],
      firstOfDayRewarded: meals.some(meal => meal.rewarded),
    };
  }

  async weight(): Promise<WeightView> {
    const entries = [...this.state.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
    const recent = entries.slice(0, 7).map(entry => entry.kg);
    const oldest = entries[entries.length - 1];
    const newest = entries[0];

    return {
      today: entries.find(entry => entry.date === today()) ?? null,
      entries,
      trend: entries
        .slice()
        .reverse()
        .map(entry => ({ date: entry.date, value: entry.kg })),
      sevenDayAverageKg: averageOf(recent),
      ninetyDayChangeKg: newest && oldest ? Number((newest.kg - oldest.kg).toFixed(1)) : null,
      ninetyDayStartKg: oldest?.kg ?? null,
      trendNote: 'Trend line −0.7 kg a month',
      context: ['Morning run kept 86% of days in the same window', 'Average sleep 7h 10m — steadiest in three months', 'Meals logged on 19 of 23 days'],
    };
  }

  async health(date: string): Promise<HealthView> {
    const metrics = HEALTH_METRICS.map(definition => {
      const entry = this.state.metrics.find(item => item.key === definition.key && item.date === date) ?? null;
      return {
        definition,
        entry,
        meta: entry ? metricMeta(entry) : 'Nothing logged today — blank, not zero',
        trendLabel: METRIC_TRENDS[definition.key],
        last14Days: METRIC_SERIES[definition.key],
        offer: deriveThresholdOffer(definition, entry?.value ?? null),
      };
    });

    const history = [...this.state.metrics]
      .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
      .slice(0, 6)
      .flatMap(entry => {
        const definition = HEALTH_METRICS.find(item => item.key === entry.key);
        if (!definition) return [];
        const offer = deriveThresholdOffer(definition, entry.value);
        return [
          {
            date: entry.date === today() ? 'Today' : entry.date,
            text: `${definition.name} ${entry.value}${definition.unit ? ` ${definition.unit}` : ''}${entry.replacedValue === null ? '' : ` · replaced ${entry.replacedValue}`}`,
            badge: offer?.met ? 'Threshold met' : null,
          },
        ];
      });

    return {
      date,
      metrics,
      history,
      thresholds: [{ label: 'Steps ≥ 8,000 → Move 8,000 steps' }, { label: 'Water ≥ 2 l → Drink 2 litres' }, { label: 'Sleep ≥ 7 h → not linked to any quest' }],
    };
  }

  async sideQuests(): Promise<SideQuestsView> {
    const items = [...this.state.sideQuests].sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
    const weekStart = shiftDays(-7);
    const monthStart = shiftDays(-30);
    const thisMonth = items.filter(item => item.date >= monthStart);

    return {
      items,
      totalLogged: 46,
      loggedThisWeek: items.filter(item => item.date >= weekStart).length,
      rewardedToday: rewardedSideQuestsOn(items, today()),
      xpThisMonth: thisMonth.reduce((total, item) => total + item.xpAwarded, 0),
      loggedThisMonth: thisMonth.length,
      patternHint: { name: 'Tidied the workshop', occurrences: 4 },
    };
  }

  async dispatchCommand(command: QuickLogCommand): Promise<QuickLogCommandResult> {
    return applyQuickLogCommand(this.state, command);
  }
}

export interface QuickLogApplyContext {
  /** The module-linked quest this entry could satisfy. Present means the entry's own reward is suppressed — the quest's reward is the owner's to claim (PRD §2.6). */
  linkage?: QuestLinkageOffer | null;
}

function saveJournal(state: QuickLogState, draft: JournalDraft, context: QuickLogApplyContext): QuickLogCommandResult {
  const suppressed = !isFirstOfDay(state.journal, draft.date) || Boolean(context.linkage);
  const entry: JournalEntry = {
    id: draft.id ?? `journal-${Date.now().toString(36)}`,
    date: draft.date,
    title: journalExcerpt(draft.text, 40) || 'Untitled',
    text: draft.text,
    mood: draft.mood,
    tags: draft.tags ?? [],
    wordCount: journalWordCount(draft.text),
    loggedAt: new Date().toISOString(),
    rewarded: !suppressed,
  };
  state.journal = [entry, ...state.journal];
  state.monthlyCounts.journal += 1;
  return {
    id: entry.id,
    message: 'Entry saved.',
    reward: firstOfDayReward('journal', suppressed),
    advisory: deriveCapAdvisory('journal', state.monthlyCounts.journal),
    ...(context.linkage ? { linkageOffer: context.linkage } : {}),
  };
}

function logMeal(state: QuickLogState, meal: Omit<Meal, 'loggedAt' | 'rewarded'>, context: QuickLogApplyContext): QuickLogCommandResult {
  const suppressed = !isFirstOfDay(state.meals, meal.date) || Boolean(context.linkage);
  const saved: Meal = { ...meal, loggedAt: new Date().toISOString(), rewarded: !suppressed };
  state.meals = [...state.meals, saved];
  state.monthlyCounts.meals += 1;
  return {
    id: saved.id,
    message: `${saved.name} logged.`,
    reward: firstOfDayReward('meal', suppressed),
    advisory: deriveCapAdvisory('meals', state.monthlyCounts.meals),
    ...(context.linkage ? { linkageOffer: context.linkage } : {}),
  };
}

function logPreset(state: QuickLogState, presetId: string, date: string, id: string | undefined, context: QuickLogApplyContext): QuickLogCommandResult {
  const preset = state.presets.find(item => item.id === presetId);
  if (!preset) return { id: presetId, message: 'That preset is no longer here.' };

  const suppressed = !isFirstOfDay(state.meals, date) || Boolean(context.linkage);
  const meal = snapshotPresetToMeal(preset, { id: id ?? `meal-${Date.now().toString(36)}`, date, loggedAt: new Date().toISOString(), rewarded: !suppressed });
  state.meals = [...state.meals, meal];
  state.presets = state.presets.map(item => (item.id === presetId ? { ...item, usageCount: item.usageCount + 1 } : item));
  state.monthlyCounts.meals += 1;
  return {
    id: meal.id,
    message: `${meal.name} logged.`,
    reward: firstOfDayReward('meal', suppressed),
    advisory: deriveCapAdvisory('meals', state.monthlyCounts.meals),
    ...(context.linkage ? { linkageOffer: context.linkage } : {}),
  };
}

function savePreset(state: QuickLogState, preset: Omit<MealPreset, 'id' | 'usageCount'>): QuickLogCommandResult {
  const saved: MealPreset = { ...preset, id: `preset-${Date.now().toString(36)}`, usageCount: 0 };
  state.presets = [...state.presets, saved];
  return { id: saved.id, message: `${saved.name} saved as a preset. Meals already logged keep the values they were logged with.` };
}

function saveWeight(state: QuickLogState, date: string, kg: number, confirmedReplacement: boolean, context: QuickLogApplyContext): QuickLogCommandResult {
  const existing = sameDayWeight(state.weights, date);
  if (existing && !confirmedReplacement)
    return { id: existing.id, message: 'One value a day — confirm to replace today’s.', needsConfirmation: { kind: 'weight-replace', existing } };

  const suppressed = Boolean(existing) || Boolean(context.linkage);
  const entry: WeightEntry = {
    id: existing?.id ?? date,
    date,
    kg,
    loggedAt: new Date().toISOString(),
    rewarded: existing ? existing.rewarded : !suppressed,
    replacedKg: existing?.kg,
    note: existing ? `Replaced ${existing.kg} kg` : undefined,
  };
  state.weights = existing ? state.weights.map(item => (item.id === existing.id ? entry : item)) : [entry, ...state.weights];
  if (!existing) state.monthlyCounts.weight += 1;

  return {
    id: entry.id,
    message: existing ? `Replaced ${existing.kg} kg with ${kg} kg. The old value stays in History.` : 'Weight saved.',
    reward: firstOfDayReward('weight', suppressed),
    advisory: deriveCapAdvisory('weight', state.monthlyCounts.weight),
    ...(context.linkage ? { linkageOffer: context.linkage } : {}),
  };
}

function logSideQuest(state: QuickLogState, draft: SideQuestDraft): QuickLogCommandResult {
  const reward = nextSideQuestReward(rewardedSideQuestsOn(state.sideQuests, draft.date));
  const entry: SideQuest = {
    id: draft.id ?? `sq-${Date.now().toString(36)}`,
    date: draft.date,
    name: draft.name,
    statAffinity: draft.statAffinity,
    xpAwarded: reward.xp,
    coinsAwarded: reward.coins,
    statTicked: reward.statTicked,
    rewarded: reward.rewarded,
    loggedAt: new Date().toISOString(),
    meta: 'Just now',
  };
  state.sideQuests = [entry, ...state.sideQuests];
  state.monthlyCounts.sidequests += 1;
  return { id: entry.id, message: `${entry.name} logged.`, reward, advisory: deriveCapAdvisory('sidequests', state.monthlyCounts.sidequests) };
}

function saveMetric(state: QuickLogState, key: HealthMetricKey, date: string, value: number): QuickLogCommandResult {
  const existing = state.metrics.find(item => item.key === key && item.date === date) ?? null;
  const entry: HealthMetricEntry = { key, date, value, loggedAt: new Date().toISOString(), replacedValue: existing?.value ?? null, source: 'manual' };
  state.metrics = existing ? state.metrics.map(item => (item === existing ? entry : item)) : [entry, ...state.metrics];
  return { id: `${key}-${date}`, message: existing ? `Replaced ${existing.value} with ${value}.` : 'Saved.' };
}

/** The optimistic apply, shared by the fixtures and by the sync layer's replay of what is still queued. */
export function applyQuickLogCommand(state: QuickLogState, command: QuickLogCommand, context: QuickLogApplyContext = {}): QuickLogCommandResult {
  switch (command.type) {
    case 'journal.save':
      return saveJournal(state, command.draft, context);
    case 'journal.dismissPrompt':
      state.promptDismissed = true;
      return { id: 'prompt', message: 'Put away for today.' };
    case 'meal.log':
      return logMeal(state, { ...command.draft, id: command.draft.id ?? `meal-${Date.now().toString(36)}`, sourceLabel: 'Typed', proteinG: 0, carbsG: 0, fatG: 0 }, context);
    case 'meal.logPreset':
      return logPreset(state, command.presetId, command.date, command.id, context);
    case 'meal.savePreset':
      return savePreset(state, command.preset);
    case 'weight.save':
      return saveWeight(state, command.date, command.kg, command.confirmedReplacement, context);
    case 'sidequest.log':
      return logSideQuest(state, command.draft);
    case 'health.save':
      return saveMetric(state, command.key, command.date, command.value);
    case 'health.acceptOffer':
      return { id: `${command.key}-${command.date}`, message: 'Quest completed. The reward is the quest’s own, not the log’s.' };
  }
}

function metricMeta(entry: HealthMetricEntry): string {
  const when = entry.loggedAt.slice(11, 16);
  return entry.replacedValue === null ? `Today · logged ${when}` : `Today · logged ${when} · replaced ${entry.replacedValue}`;
}

let provider: QuickLogProvider = new FixtureQuickLogProvider();

export function setQuickLogProvider(next: QuickLogProvider): void {
  provider = next;
}

export function getQuickLogProvider(): QuickLogProvider {
  return provider;
}

export const quickLogKeys = {
  all: ['quick-logs'] as const,
  journal: () => ['quick-logs', 'journal'] as const,
  meals: (date: string) => ['quick-logs', 'meals', date] as const,
  weight: () => ['quick-logs', 'weight'] as const,
  health: (date: string) => ['quick-logs', 'health', date] as const,
  sideQuests: () => ['quick-logs', 'side-quests'] as const,
};

const journalQuery = () => queryOptions({ queryKey: quickLogKeys.journal(), queryFn: () => provider.journal() });

const mealsQuery = (date: string) => queryOptions({ queryKey: quickLogKeys.meals(date), queryFn: () => provider.meals(date) });

const weightQuery = () => queryOptions({ queryKey: quickLogKeys.weight(), queryFn: () => provider.weight() });

const healthQuery = (date: string) => queryOptions({ queryKey: quickLogKeys.health(date), queryFn: () => provider.health(date) });

const sideQuestsQuery = () => queryOptions({ queryKey: quickLogKeys.sideQuests(), queryFn: () => provider.sideQuests() });

export function useJournal(): UseQueryResult<JournalView> {
  return useQuery(journalQuery());
}

export function useMeals(date: string): UseQueryResult<MealsView> {
  return useQuery(mealsQuery(date));
}

export function useWeight(): UseQueryResult<WeightView> {
  return useQuery(weightQuery());
}

export function useHealth(date: string): UseQueryResult<HealthView> {
  return useQuery(healthQuery(date));
}

export function useSideQuests(): UseQueryResult<SideQuestsView> {
  return useQuery(sideQuestsQuery());
}

export function useQuickLogCommand(): UseMutationResult<QuickLogCommandResult, Error, QuickLogCommand> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: QuickLogCommand) => provider.dispatchCommand(command),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quickLogKeys.all }),
  });
}

export { today as todayISODate };
