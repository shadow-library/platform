import { addDays, toISODate } from '@shadow-library/ui';

import {
  applyQuickLogCommand,
  averageOf,
  type DayValue,
  formatMetricValue,
  HEALTH_METRICS,
  type HealthMetricEntry,
  type HealthView,
  type JournalView,
  type MealsView,
  MemoirEngine,
  type MemoirWorldState,
  type ModuleLink,
  type OccurrenceState,
  type QuestLinkageOffer,
  type QuickLogCommand,
  type QuickLogCommandResult,
  type QuickLogProvider,
  type QuickLogState,
  rewardedSideQuestsOn,
  type SideQuestsView,
  type ThresholdOffer,
  type WeightView,
} from '@/lib/data';

import { isQuickLogCommand, mintCommandIds } from './command-wire';
import { projectQuickLogRows, type QuickLogRows } from './projection';
import { type SyncEngine } from './sync-engine';

const COMPLETED_STATES: OccurrenceState[] = ['completed', 'partial', 'late'];

const JOURNAL_PROMPT = { id: 'prompt-unexpected', question: 'What did today ask of you that you did not expect?' };

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function daysBack(today: string, count: number): string[] {
  const anchor = new Date(`${today}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => toISODate(addDays(anchor, index - count + 1)));
}

function seriesOver(dates: string[], valueOf: (date: string) => number | null): DayValue[] {
  return dates.map(date => ({ date, value: valueOf(date) }));
}

interface SyncedQuickLogState extends QuickLogState {
  metricIds: QuickLogRows['metricIds'];
  offers: ThresholdOffer[];
}

function toState(rows: QuickLogRows, today: string): SyncedQuickLogState {
  const inMonth = (date: string): boolean => monthOf(date) === monthOf(today);
  return {
    journal: rows.journal,
    promptDismissed: false,
    meals: rows.meals,
    presets: rows.presets,
    weights: rows.weights,
    sideQuests: rows.sideQuests,
    metrics: rows.metricEntries,
    monthlyCounts: {
      journal: rows.journal.filter(entry => inMonth(entry.date)).length,
      meals: rows.meals.filter(meal => inMonth(meal.date)).length,
      weight: rows.weights.filter(entry => inMonth(entry.date)).length,
      sidequests: rows.sideQuests.filter(entry => inMonth(entry.date)).length,
    },
    metricIds: rows.metricIds,
    offers: rows.offers,
  };
}

function writingStreak(dates: Set<string>, today: string): number {
  let days = 0;
  for (let index = 0; ; index += 1) {
    const date = toISODate(addDays(new Date(`${today}T00:00:00.000Z`), -index));
    if (!dates.has(date)) return days;
    days += 1;
  }
}

function metricMeta(entry: HealthMetricEntry | null): string {
  if (!entry) return 'Nothing logged today — blank, not zero';
  return `Logged ${entry.loggedAt.slice(11, 16)}`;
}

/**
 * The quick-log domain read from the local mirror and written through the outbox. `health.save` carries
 * the account's catalogue id for its metric, resolved here from the `metrics` snapshot domain on
 * `isHealth` + `name`, because the server's `metric.register` addresses a metric row rather than a key.
 */
export class SyncedQuickLogProvider implements QuickLogProvider {
  private state: SyncedQuickLogState;
  private world: MemoirWorldState;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly sync: SyncEngine) {
    this.state = toState(projectQuickLogRows(sync.domains()), sync.today);
    this.world = sync.world();
    sync.subscribeWorld(() => void (this.pending = this.pending.then(() => this.reproject())));
  }

  async reproject(): Promise<void> {
    const state = toState(projectQuickLogRows(this.sync.domains()), this.sync.today);
    for (const entry of await this.sync.outbox.pending()) if (isQuickLogCommand(entry.command)) applyQuickLogCommand(state, entry.command);
    this.state = state;
    this.world = this.sync.world();
  }

  async journal(): Promise<JournalView> {
    const today = this.sync.today;
    const dates = daysBack(today, 28);
    const byDate = new Map(this.state.journal.map(entry => [entry.date, entry]));

    return {
      today: byDate.get(today) ?? null,
      prompt: this.state.promptDismissed ? null : JOURNAL_PROMPT,
      entries: [...this.state.journal].sort((a, b) => (a.date < b.date ? 1 : -1)),
      totalEntries: this.state.journal.length,
      writingStreakDays: writingStreak(new Set(byDate.keys()), today),
      last28Days: seriesOver(dates, date => byDate.get(date)?.wordCount ?? null),
      moodTrend: seriesOver(dates, date => byDate.get(date)?.mood ?? null),
      moodNote: '',
      onThisDay: null,
      draftNote: 'Autosaves as you write',
    };
  }

  async meals(date: string): Promise<MealsView> {
    const meals = this.state.meals.filter(meal => meal.date === date).sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1));
    const caloriesOn = (day: string): number | null => {
      const logged = this.state.meals.filter(meal => meal.date === day);
      return logged.length === 0 ? null : logged.reduce((total, meal) => total + meal.calories, 0);
    };
    const last14Days = seriesOver(daysBack(this.sync.today, 14), caloriesOn);

    return {
      date,
      meals,
      presets: [...this.state.presets].sort((a, b) => b.usageCount - a.usageCount),
      totalCalories: meals.reduce((total, meal) => total + meal.calories, 0),
      macros: { proteinG: 0, carbsG: 0, fatG: 0 },
      last14Days,
      averageCalories: Math.round(averageOf(last14Days.map(day => day.value)) ?? 0),
      history: daysBack(this.sync.today, 5)
        .slice(0, 4)
        .reverse()
        .map(day => {
          const logged = this.state.meals.filter(meal => meal.date === day);
          return { date: day, summary: logged.length === 0 ? 'Nothing logged — blank, not zero' : `${logged.length} meals`, calories: caloriesOn(day) };
        }),
      firstOfDayRewarded: meals.some(meal => meal.rewarded),
    };
  }

  async weight(): Promise<WeightView> {
    const entries = [...this.state.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
    const newest = entries[0];
    const oldest = entries[entries.length - 1];

    return {
      today: entries.find(entry => entry.date === this.sync.today) ?? null,
      entries,
      trend: entries
        .slice()
        .reverse()
        .map(entry => ({ date: entry.date, value: entry.kg })),
      sevenDayAverageKg: averageOf(entries.slice(0, 7).map(entry => entry.kg)),
      ninetyDayChangeKg: newest && oldest ? Number((newest.kg - oldest.kg).toFixed(1)) : null,
      ninetyDayStartKg: oldest?.kg ?? null,
      trendNote: '',
      context: [],
    };
  }

  async health(date: string): Promise<HealthView> {
    const dates = daysBack(this.sync.today, 14);
    const metrics = HEALTH_METRICS.map(definition => {
      const entry = this.state.metrics.find(item => item.key === definition.key && item.date === date) ?? null;
      return {
        definition,
        entry,
        meta: metricMeta(entry),
        trendLabel: '',
        last14Days: seriesOver(dates, day => this.state.metrics.find(item => item.key === definition.key && item.date === day)?.value ?? null),
        offer: this.state.offers.find(offer => offer.metricKey === definition.key && offer.currentValue === entry?.value) ?? null,
      };
    });

    return {
      date,
      metrics,
      history: [...this.state.metrics]
        .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
        .slice(0, 6)
        .flatMap(entry => {
          const definition = HEALTH_METRICS.find(item => item.key === entry.key);
          if (!definition) return [];
          return [{ date: entry.date, text: `${definition.name} ${formatMetricValue(entry.value, definition)}`, badge: null }];
        }),
      thresholds: this.state.offers.map(offer => ({
        label: `${HEALTH_METRICS.find(item => item.key === offer.metricKey)?.name ?? offer.metricKey} ≥ ${offer.thresholdValue} → ${offer.questTitle}`,
      })),
    };
  }

  async sideQuests(): Promise<SideQuestsView> {
    const items = [...this.state.sideQuests].sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
    const weekStart = toISODate(addDays(new Date(`${this.sync.today}T00:00:00.000Z`), -7));
    const thisMonth = items.filter(item => monthOf(item.date) === monthOf(this.sync.today));

    return {
      items,
      totalLogged: items.length,
      loggedThisWeek: items.filter(item => item.date >= weekStart).length,
      rewardedToday: rewardedSideQuestsOn(items, this.sync.today),
      xpThisMonth: thisMonth.reduce((total, item) => total + item.xpAwarded, 0),
      loggedThisMonth: thisMonth.length,
      patternHint: null,
    };
  }

  /**
   * PRD §2.6's consent step, mirrored locally so the optimistic result matches the server's: an entry
   * that could satisfy a module-linked quest scheduled for the same day suppresses its own reward and
   * reports the quest. Completing it stays the owner's own `quest.complete`.
   */
  private async linkageFor(module: ModuleLink, date: string): Promise<QuestLinkageOffer | null> {
    const linked = this.world.quests.filter(quest => quest.active && quest.moduleLink === module);
    if (linked.length === 0) return null;

    const day = await new MemoirEngine(this.world).getDay(date);
    for (const occurrence of day.occurrences) {
      const quest = linked.find(item => item.id === occurrence.questId);
      if (!quest) continue;
      return { status: COMPLETED_STATES.includes(occurrence.state) ? 'already-completed' : 'offered', questId: quest.id, questName: quest.name, date };
    }
    return null;
  }

  private linkableModule(command: QuickLogCommand): { module: ModuleLink; date: string } | null {
    if (command.type === 'journal.save') return { module: 'journal', date: command.draft.date };
    if (command.type === 'meal.log') return { module: 'meal', date: command.draft.date };
    if (command.type === 'meal.logPreset') return { module: 'meal', date: command.date };
    if (command.type === 'weight.save') return { module: 'weight', date: command.date };
    return null;
  }

  async dispatchCommand(command: QuickLogCommand): Promise<QuickLogCommandResult> {
    const resolved = command.type === 'health.save' ? { ...command, metricId: this.state.metricIds[command.key] } : command;
    const minted = mintCommandIds(resolved) as QuickLogCommand;

    const linkable = this.linkableModule(minted);
    const linkage = linkable ? await this.linkageFor(linkable.module, linkable.date) : null;

    const result = applyQuickLogCommand(this.state, minted, { linkage });
    if (result.needsConfirmation) return result;

    await this.sync.enqueue(minted, this.sync.today);
    return result;
  }
}
