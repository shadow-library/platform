import { addDays, parseISODate, toISODate } from '@shadow-library/ui';

import { formatCount, formatLocalTime } from '@/lib/format';

import {
  applyQuickLogCommand,
  averageOf,
  capAdvisoryForTier,
  type DayValue,
  type DispatchOptions,
  formatMetricValue,
  HEALTH_METRICS,
  type HealthMetricDefinition,
  type HealthMetricEntry,
  type HealthMetricKey,
  type HealthView,
  journalExcerpt,
  type JournalView,
  type MealsView,
  MemoirEngine,
  type MemoirWorldState,
  type ModuleLink,
  moodOption,
  type MoodValence,
  type OccurrenceState,
  type QuestLinkageOffer,
  type QuickLogCommand,
  type QuickLogCommandResult,
  type QuickLogProvider,
  type QuickLogState,
  type QuickLogTile,
  quickLogTiles,
  rewardedSideQuestsOn,
  type SideQuestsView,
  type ThresholdOffer,
  todayISODate,
  type WeightView,
} from '@/lib/data';

import { isQuickLogCommand, mintCommandIds } from './command-wire';
import { ignoreAccountBoundary, type MetaKey, type UnloadCopy } from './memoir-store';
import { mirroredTier, projectFinanceRows, projectQuickLogRows, type QuickLogRows } from './projection';
import { type SyncEngine } from './sync-engine';
import { SYNC_META_KEYS } from './sync.types';

const COMPLETED_STATES: OccurrenceState[] = ['completed', 'partial', 'late'];

const JOURNAL_PROMPT = { id: 'prompt-unexpected', question: 'What did today ask of you that you did not expect?' };

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function shiftDate(date: string, days: number): string {
  return toISODate(addDays(parseISODate(date) ?? new Date(Number.NaN), days));
}

function daysBack(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - count + 1));
}

function seriesOver(dates: string[], valueOf: (date: string) => number | null): DayValue[] {
  return dates.map(date => ({ date, value: valueOf(date) }));
}

function formatKg(kg: number): string {
  return kg.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function moodNote(moods: DayValue[]): string {
  const logged = moods.flatMap(day => (day.value === null ? [] : [day.value]));
  const average = averageOf(logged);
  if (average === null) return 'No mood logged in the last 28 days.';
  return `Mostly ${moodOption(Math.round(average) as MoodValence)?.label ?? 'Steady'} across ${formatCount(logged.length, 'day', 'days')} with a mood.`;
}

interface SyncedQuickLogState extends QuickLogState {
  metricIds: QuickLogRows['metricIds'];
  offers: ThresholdOffer[];
}

interface StoredJournalDraft {
  date: string;
  text: string;
  mood: MoodValence | null;
}

function isStoredJournalDraft(value: unknown): value is StoredJournalDraft {
  if (typeof value !== 'object' || value === null) return false;
  const { date, text, mood } = value as Record<string, unknown>;
  return typeof date === 'string' && typeof text === 'string' && (mood === null || moodOption(mood as MoodValence) !== null);
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
    if (!dates.has(shiftDate(today, -index))) return days;
    days += 1;
  }
}

function metricMeta(entry: HealthMetricEntry | null): string {
  if (!entry) return 'Nothing logged today — blank, not zero';
  return `Logged ${formatLocalTime(entry.loggedAt)}`;
}

function definitionOf(key: HealthMetricKey): HealthMetricDefinition {
  return HEALTH_METRICS.find(item => item.key === key) as HealthMetricDefinition;
}

function latestMetricEntry(entries: HealthMetricEntry[], key: HealthMetricKey, date: string): HealthMetricEntry | null {
  return entries
    .filter(item => item.key === key && item.date === date)
    .reduce<HealthMetricEntry | null>((latest, item) => (latest && latest.loggedAt >= item.loggedAt ? latest : item), null);
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
    sync.subscribeProjection(() => (this.pending = this.pending.then(() => this.reproject())));
  }

  async reproject(): Promise<void> {
    const state = toState(projectQuickLogRows(this.sync.domains()), this.sync.today);
    for (const entry of await this.sync.outbox.pending()) if (isQuickLogCommand(entry.command)) applyQuickLogCommand(state, entry.command);
    this.state = state;
    this.world = this.sync.world();
  }

  // Treats a raced account switch or store wipe as "nothing there" rather than an unhandled rejection.
  private async readMetaSafe<T>(key: MetaKey): Promise<T | undefined> {
    return this.sync.store.readMeta<T>(key).catch(error => {
      ignoreAccountBoundary(error);
      return undefined;
    });
  }

  async tiles(date: string): Promise<QuickLogTile[]> {
    const { expenses, settings } = projectFinanceRows(this.sync.domains());
    const { meals, metrics, weights, journal } = this.state;
    return quickLogTiles({ date, currency: settings.homeCurrency, expenses, meals, metrics, weights, journal });
  }

  async journal(): Promise<JournalView> {
    const today = this.sync.today;
    const dates = daysBack(today, 28);
    const byDate = new Map(this.state.journal.map(entry => [entry.date, entry]));
    const dismissedOn = await this.readMetaSafe<string>(SYNC_META_KEYS.journalPromptDismissedOn);
    const moodTrend = seriesOver(dates, date => byDate.get(date)?.mood ?? null);
    const earlierThisDay = this.state.journal.filter(entry => entry.date < today && entry.date.slice(5) === today.slice(5)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

    return {
      today: byDate.get(today) ?? null,
      prompt: dismissedOn === todayISODate() ? null : JOURNAL_PROMPT,
      entries: [...this.state.journal].sort((a, b) => (a.date < b.date ? 1 : -1)),
      totalEntries: this.state.journal.length,
      writingStreakDays: writingStreak(new Set(byDate.keys()), today),
      last28Days: seriesOver(dates, date => byDate.get(date)?.wordCount ?? null),
      moodTrend,
      moodNote: moodNote(moodTrend),
      onThisDay: earlierThisDay ? { year: Number(earlierThisDay.date.slice(0, 4)), excerpt: journalExcerpt(earlierThisDay.text, 140) } : null,
      draftNote: 'Autosaves as you write',
    };
  }

  async readJournalDraft(): Promise<{ date: string; text: string; mood: MoodValence | null } | null> {
    const persisted = await this.readMetaSafe<StoredJournalDraft>(SYNC_META_KEYS.journalDraft);
    const backup = this.sync.store.readUnloadMeta(SYNC_META_KEYS.journalDraft);
    const stored = backup && isStoredJournalDraft(backup.value) ? await this.adoptDraftBackup(backup, backup.value) : persisted;
    return stored ? { date: stored.date, text: stored.text, mood: stored.mood } : null;
  }

  async saveJournalDraft(text: string, mood: MoodValence | null): Promise<void> {
    await this.persistJournalDraft({ date: todayISODate(), text, mood }).catch(ignoreAccountBoundary);
  }

  async clearJournalDraft(): Promise<void> {
    await this.persistJournalDraft(null).catch(ignoreAccountBoundary);
  }

  backupJournalDraft(text: string, mood: MoodValence | null): void {
    this.sync.store.writeUnloadMeta(SYNC_META_KEYS.journalDraft, { date: todayISODate(), text, mood } satisfies StoredJournalDraft);
  }

  private async adoptDraftBackup(copy: UnloadCopy, backup: StoredJournalDraft): Promise<StoredJournalDraft | null> {
    const draft = backup.text.trim() ? backup : null;
    await this.persistJournalDraft(draft, copy).catch(ignoreAccountBoundary);
    return draft;
  }

  private async persistJournalDraft(draft: StoredJournalDraft | null, copy = this.sync.store.readUnloadMeta(SYNC_META_KEYS.journalDraft)): Promise<void> {
    await this.sync.store.writeMeta(SYNC_META_KEYS.journalDraft, draft);
    this.sync.store.releaseUnloadMeta(SYNC_META_KEYS.journalDraft, copy);
  }

  async meals(date: string): Promise<MealsView> {
    const meals = this.state.meals.filter(meal => meal.date === date).sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1));
    const mealsOn = (day: string): number => this.state.meals.filter(meal => meal.date === day).length;
    const caloriesOn = (day: string): number | null => {
      const logged = this.state.meals.filter(meal => meal.date === day);
      return logged.length === 0 ? null : logged.reduce((total, meal) => total + meal.calories, 0);
    };
    const days = daysBack(this.sync.today, 14);
    const last14Days = seriesOver(days, caloriesOn);
    const average = averageOf(last14Days.map(day => day.value));

    return {
      date,
      meals,
      presets: [...this.state.presets].sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name)),
      totalCalories: meals.reduce((total, meal) => total + meal.calories, 0),
      last14Days,
      averageCalories: average === null ? null : Math.round(average),
      history: [...days].reverse().map(day => ({
        date: day,
        summary: mealsOn(day) === 0 ? 'Nothing logged — blank, not zero' : formatCount(mealsOn(day), 'meal', 'meals'),
        calories: caloriesOn(day),
      })),
      firstOfDayRewarded: meals.some(meal => meal.rewarded),
    };
  }

  async weight(): Promise<WeightView> {
    const today = this.sync.today;
    const entries = [...this.state.weights].sort((a, b) => (a.date < b.date ? 1 : -1));
    const recent = entries.filter(entry => entry.date >= shiftDate(today, -89) && entry.date <= today);
    const newest = recent[0];
    const start = recent[recent.length - 1];
    const kgs = recent.map(entry => entry.kg);

    return {
      today: entries.find(entry => entry.date === today) ?? null,
      entries,
      trend: [...recent].reverse().map(entry => ({ date: entry.date, value: entry.kg })),
      sevenDayAverageKg: averageOf(recent.filter(entry => entry.date >= shiftDate(today, -6)).map(entry => entry.kg)),
      ninetyDayChangeKg: newest && start && newest !== start ? Number((newest.kg - start.kg).toFixed(1)) : null,
      ninetyDayStartKg: newest && start && newest !== start ? start.kg : null,
      trendNote: kgs.length === 0 ? '' : `${formatKg(Math.min(...kgs))}–${formatKg(Math.max(...kgs))} kg`,
      context: [],
    };
  }

  async health(date: string): Promise<HealthView> {
    const dates = daysBack(this.sync.today, 14);
    const thresholdQuests = this.world.quests.filter(quest => quest.active && quest.healthThreshold !== null);
    const dayView = thresholdQuests.length === 0 && this.state.offers.length === 0 ? null : await new MemoirEngine(this.world).getDay(date);
    const completedQuestIds = new Set(dayView?.occurrences.filter(occurrence => COMPLETED_STATES.includes(occurrence.state)).map(occurrence => occurrence.questId));
    const completedOn = (key: HealthMetricKey): string | null =>
      thresholdQuests.find(quest => quest.healthThreshold?.metricKey === key && completedQuestIds.has(quest.id))?.name ?? null;

    const metrics = HEALTH_METRICS.map(definition => {
      const entry = latestMetricEntry(this.state.metrics, definition.key, date);
      const offer = this.state.offers.find(
        item => item.metricKey === definition.key && item.date === date && item.currentValue === entry?.value && (item.questId === null || !completedQuestIds.has(item.questId)),
      );
      return {
        definition,
        entry,
        meta: metricMeta(entry),
        trendLabel: '',
        last14Days: seriesOver(dates, day => latestMetricEntry(this.state.metrics, definition.key, day)?.value ?? null),
        offer: offer ? { ...offer, note: `Threshold ${formatMetricValue(offer.thresholdValue, definition)} reached — the quest is waiting for you.` } : null,
        completedQuest: completedOn(definition.key),
      };
    });

    return {
      date,
      metrics,
      history: [...this.state.metrics]
        .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))
        .slice(0, 6)
        .map(entry => ({ date: entry.date, text: `${definitionOf(entry.key).name} ${formatMetricValue(entry.value, definitionOf(entry.key))}`, badge: null })),
      thresholds: thresholdQuests.flatMap(quest => {
        const threshold = quest.healthThreshold;
        if (!threshold) return [];
        const definition = definitionOf(threshold.metricKey);
        return [{ label: `${definition.name} ${threshold.comparison === 'gte' ? '≥' : '≤'} ${formatMetricValue(threshold.value, definition)} → ${quest.name}` }];
      }),
    };
  }

  async sideQuests(): Promise<SideQuestsView> {
    const items = [...this.state.sideQuests].sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
    const weekStart = shiftDate(this.sync.today, -7);
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

  async dispatchCommand(command: QuickLogCommand, options?: DispatchOptions): Promise<QuickLogCommandResult> {
    if (command.type === 'journal.dismissPrompt') {
      await this.sync.store.writeMeta(SYNC_META_KEYS.journalPromptDismissedOn, todayISODate()).catch(ignoreAccountBoundary);
      return { id: 'prompt', message: 'Put away for today.', delivery: { status: 'local' } };
    }

    const resolved = command.type === 'health.save' ? { ...command, metricId: this.state.metricIds[command.key] } : command;
    const minted = mintCommandIds(resolved) as QuickLogCommand;

    const linkable = this.linkableModule(minted);
    const linkage = linkable ? await this.linkageFor(linkable.module, linkable.date) : null;

    const applied = applyQuickLogCommand(this.state, minted, { linkage });
    if (applied.needsConfirmation) return applied;
    const result = { ...applied, advisory: capAdvisoryForTier(applied.advisory, mirroredTier(this.sync.domains())) };

    const delivery = await this.sync.enqueue(minted, this.sync.today, options);
    if (delivery.status === 'refused') await this.reproject().catch(ignoreAccountBoundary);
    // Once queued, the outbox survives a reload instead of the draft. Only a save of the draft's own text clears it: a line from quick capture must not wipe the editor's draft.
    if (minted.type === 'journal.save' && delivery.status !== 'refused' && (await this.readJournalDraft())?.text === minted.draft.text) await this.clearJournalDraft();
    return { ...result, delivery };
  }
}
