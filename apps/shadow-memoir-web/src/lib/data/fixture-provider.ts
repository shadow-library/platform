import { buildMonthMatrix, parseISODate, toISODate } from '@shadow-library/ui';

import { formatCount } from '@/lib/format';

import { matchQuestName } from './capture-parser';
import { type Command, type CommandResult } from './command.types';
import { type DataProvider, type PlanRange, type QuestFilter } from './data-provider';
import { type Persona, seed } from './fixtures';
import { type HeroIntensityMode } from './hero.types';
import {
  COMING_BACK_NOTICES,
  formatDuration,
  formatMonth,
  formatRange,
  formatShortDate,
  formatTime,
  shiftDate,
  startOfWeek,
  STATE_LABELS,
  STRICTNESS_LABELS,
  toDate,
  WEEKDAY_LABELS,
  weekdayOf,
  WEEKDAYS,
} from './labels';
import { KEPT_STATES, RESCHEDULE_WINDOW_DAYS, reschedulesCountedFor } from './quest.rules';
import {
  type OccurrenceState,
  type Quest,
  type QuestDetail,
  type QuestDraft,
  type QuestLogEntry,
  type QuestOccurrence,
  type QuestProgress,
  type QuestSummary,
  type ReasonTag,
  type Recurrence,
  type Strictness,
  type Weekday,
} from './quest.types';
import { type HealthMetricKey } from './quick-logs.types';
import { nextOccurrenceAfter, occursOn } from './recurrence.rules';
import {
  type ActivityEntry,
  type CaptureTarget,
  type DayMode,
  type DayView,
  type HeroState,
  type PlanDay,
  type PlanItem,
  type PlanMonthCell,
  type PlanView,
  type QuestDraftPreview,
  type StreakBoardEntry,
} from './view.types';

const BASE_XP: Record<Strictness, number> = { anchor: 12, routine: 10, goal: 8, recovery: 5, optional: 8 };
const BASE_COINS: Record<Strictness, number> = { anchor: 2, routine: 1, goal: 1, recovery: 0, optional: 1 };
const HOLD_STATES: readonly OccurrenceState[] = ['completed', 'partial', 'late', 'recovery'];
const BREAK_STATES: readonly OccurrenceState[] = ['skipped', 'missed', 'postponed'];
const XP_CEILING = 25;
const MS_PER_DAY = 86_400_000;
const SOFT_CAPACITY_MINUTES = 150;
/** Track width in multiples of capacity, so overload has room to show instead of clipping at 100%. */
const LOAD_TRACK_SCALE = 2;
const PREVIEW_WINDOW_DAYS = 7;
const RESCHEDULE_CAP = 2;
const RECENT_MISS_WINDOW_DAYS = 7;

export interface LogRecord {
  state: OccurrenceState;
  xpAwarded: number;
  coinsAwarded: number;
  reasonTag: ReasonTag | null;
  reasonNote: string | null;
  rescheduledToMin: number | null;
  postponedTo: string | null;
  shielded: boolean;
  progress: number | null;
}

/**
 * Everything the day, plan and quest screens are derived from. The fixtures seed one; the sync layer
 * projects one out of the delta rows it has in IndexedDB. `MemoirEngine` never learns which it was given,
 * which is what lets an offline write and a fixture write run through the same code.
 */
export interface MemoirWorldState {
  today: string;
  persona: DayMode;
  quests: Quest[];
  progress: Record<string, QuestProgress>;
  logs: Map<string, LogRecord>;
  hero: HeroState;
  activity: ActivityEntry[];
  /** Minute of the local day the wake window closes, from the account row; null when no account has been mirrored yet. */
  scheduleEndMinutes: number | null;
  metrics: Record<string, number>;
  metricIds: Partial<Record<HealthMetricKey, string>>;
  locks: Set<string>;
  lockedQuestIdsByDate: Map<string, Set<string>>;
  intensityByDate: Map<string, HeroIntensityMode>;
  /** The intensity the next day the server opens will snapshot: a staged change, else the current one; null when no account has been mirrored. */
  openingIntensity: HeroIntensityMode | null;
}

export interface FixtureProviderOptions {
  today?: string;
  persona?: Persona;
}

function streakTier(days: number): number {
  if (days >= 100) return 1.3;
  if (days >= 30) return 1.2;
  if (days >= 7) return 1.1;
  return 1;
}

function occurrenceKey(questId: string, date: string): string {
  return `${questId}:${date}`;
}

function isScheduled(quest: Quest, date: string): boolean {
  return occursOn(quest.recurrence, date);
}

function everyNDaysNote(interval: number, occurrences: number): string {
  const cadence = interval <= 1 ? 'Every day' : `Every ${interval} days`;
  return `${cadence} — ${occurrences} ${occurrences === 1 ? 'time' : 'times'} in the next ${PREVIEW_WINDOW_DAYS} days.`;
}

function relativeDayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, 1)) return 'Tomorrow';
  const parsed = parseISODate(date);
  return parsed ? WEEKDAY_LABELS[WEEKDAYS[(parsed.getDay() + 6) % 7] as keyof typeof WEEKDAY_LABELS] : date;
}

function closedAgo(date: string, today: string): string {
  const days = Math.round((toDate(today).getTime() - toDate(date).getTime()) / MS_PER_DAY);
  if (days <= 0) return 'Closed today';
  if (days === 1) return 'Closed yesterday';
  return `Closed ${formatCount(days, 'day', 'days')} ago`;
}

/** Mirrors `rules/streak.ts#streakApplies` on the server. */
function streakApplies(quest: Quest): boolean {
  if (quest.strictness === 'recovery') return false;
  return quest.strictness !== 'optional' || quest.optionalStreakOptIn;
}

function recordFor(quest: Quest, state: OccurrenceState): LogRecord {
  const rewarded = state === 'completed' || state === 'partial';
  const base = state === 'partial' ? Math.floor(BASE_XP[quest.strictness] * 0.5) : BASE_XP[quest.strictness];
  return {
    state,
    xpAwarded: rewarded ? Math.min(XP_CEILING, base) : 0,
    coinsAwarded: state === 'completed' ? BASE_COINS[quest.strictness] : 0,
    reasonTag: state === 'partial' ? 'too_tired' : null,
    reasonNote: null,
    rescheduledToMin: null,
    postponedTo: null,
    shielded: false,
    progress: null,
  };
}

function seedHistory(state: MemoirWorldState): void {
  for (const quest of state.quests) {
    const outcomes = state.progress[quest.id]?.recentOutcomes ?? [];
    for (let back = 1; back <= 30; back += 1) {
      const date = shiftDate(state.today, -back);
      if (!isScheduled(quest, date)) continue;
      state.logs.set(occurrenceKey(quest.id, date), recordFor(quest, outcomes[outcomes.length - back] ?? 'completed'));
    }
  }

  if (state.persona !== 'active') return;
  const stretch = state.quests.find(quest => quest.id === 'evening-stretch');
  if (stretch) state.logs.set(occurrenceKey(stretch.id, shiftDate(state.today, -1)), recordFor(stretch, 'missed'));
  const run = state.quests.find(quest => quest.id === 'morning-run');
  if (run && isScheduled(run, state.today)) state.logs.set(occurrenceKey(run.id, state.today), recordFor(run, 'completed'));
}

function seedWorldState(options: FixtureProviderOptions = {}): MemoirWorldState {
  const today = options.today ?? toISODate(new Date());
  const persona = options.persona ?? 'active';
  const seeded = seed(today, persona);
  const locks = persona === 'active' ? new Set([today, shiftDate(today, 1)]) : new Set<string>();
  const state: MemoirWorldState = {
    today,
    persona,
    quests: seeded.quests,
    progress: seeded.progress,
    logs: new Map(),
    hero: seeded.hero,
    activity: seeded.activity,
    scheduleEndMinutes: null,
    metrics: seeded.metrics,
    metricIds: {},
    locks,
    lockedQuestIdsByDate: new Map([...locks].map(date => [date, new Set(seeded.lockedQuestIds)])),
    intensityByDate: new Map(),
    openingIntensity: persona === 'recovery' ? 'gentle' : 'standard',
  };
  seedHistory(state);
  return state;
}

/**
 * The pure day-group engine: every read is derived from `MemoirWorldState` and every command mutates it.
 * It is the whole of the fixture provider, and the whole of the synced provider's optimistic local apply —
 * one implementation, so an offline completion and a fixture completion cannot disagree about the effect.
 */
export class MemoirEngine implements DataProvider {
  constructor(
    private readonly state: MemoirWorldState,
    private readonly queuedOccurrences: ReadonlySet<string> = new Set(),
  ) {}

  get world(): MemoirWorldState {
    return this.state;
  }

  private questById(questId: string): Quest | undefined {
    return this.state.quests.find(quest => quest.id === questId);
  }

  private occurrence(quest: Quest, date: string): QuestOccurrence {
    const log = this.state.logs.get(occurrenceKey(quest.id, date));
    const progress = this.state.progress[quest.id] as QuestProgress;
    const target = quest.consequences[0];
    return {
      id: occurrenceKey(quest.id, date),
      questId: quest.id,
      questName: quest.name,
      date,
      statAffinity: quest.statAffinity,
      strictness: quest.strictness,
      startTimeMinutes: quest.startTimeMinutes,
      durationMinutes: quest.durationMinutes,
      state: log?.state ?? 'upcoming',
      xpAwarded: log?.xpAwarded ?? 0,
      coinsAwarded: log?.coinsAwarded ?? 0,
      reasonTag: log?.reasonTag ?? null,
      reasonNote: log?.reasonNote ?? null,
      rescheduledToMin: log?.rescheduledToMin ?? null,
      postponedTo: log?.postponedTo ?? null,
      streakDays: progress.currentStreakDays,
      shields: progress.shields,
      locked: this.state.lockedQuestIdsByDate.get(date)?.has(quest.id) ?? false,
      dayIntensity: this.state.intensityByDate.get(date) ?? (date >= this.state.today ? this.state.openingIntensity : null),
      queued: this.queuedOccurrences.has(occurrenceKey(quest.id, date)),
      threshold: quest.healthThreshold
        ? {
            metricKey: quest.healthThreshold.metricKey,
            comparison: quest.healthThreshold.comparison,
            target: quest.healthThreshold.value,
            current: this.state.metrics[quest.healthThreshold.metricKey] ?? 0,
          }
        : null,
      partialTarget: target ? { value: log?.progress ?? 0, target: target.fullValue, unit: target.unit ?? '' } : null,
    };
  }

  private scheduledOn(date: string): QuestOccurrence[] {
    return this.state.quests
      .filter(quest => quest.active && isScheduled(quest, date))
      .map(quest => this.occurrence(quest, date))
      .sort((a, b) => (a.startTimeMinutes ?? 1440) - (b.startTimeMinutes ?? 1440));
  }

  /** Only today has a window still running down; another day's remaining time is not a fact about now. */
  private wakeWindowNote(date: string): string {
    const closesAt = this.state.scheduleEndMinutes;
    if (closesAt === null || date !== this.state.today) return '';
    const now = new Date();
    const remaining = closesAt - (now.getHours() * 60 + now.getMinutes());
    return remaining <= 0 ? 'the wake window has closed' : `about ${formatDuration(remaining)} of wake window left`;
  }

  private dayHasEnded(date: string): boolean {
    if (date < this.state.today) return true;
    const closesAt = this.state.scheduleEndMinutes;
    if (closesAt === null || date !== this.state.today) return false;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= closesAt;
  }

  private daySummary(date: string, occurrences: QuestOccurrence[]): DayView['summary'] {
    if (!this.dayHasEnded(date) || occurrences.every(item => item.state === 'upcoming')) return null;
    const kept = occurrences.filter(item => KEPT_STATES.includes(item.state)).length;
    const partial = occurrences.filter(item => item.state === 'partial').length;
    const skipped = occurrences.filter(item => item.state === 'skipped').length;

    return {
      headline: 'End of day',
      detail: [
        `${kept} of ${formatCount(occurrences.length, 'quest', 'quests')} completed${partial > 0 ? `, ${partial} partial` : ''}.`,
        skipped > 0 ? `${skipped} skipped.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  async getDay(date: string): Promise<DayView> {
    const occurrences = this.scheduledOn(date);
    const hasActiveQuests = this.hasActiveQuests();

    return {
      date,
      mode: this.state.persona,
      hero: { ...this.state.hero, crown: { ...this.state.hero.crown } },
      hasActiveQuests,
      occurrences,
      nextScheduled: occurrences.length === 0 && hasActiveQuests ? this.nextScheduled(date) : null,
      recovery: this.state.persona === 'recovery' || this.state.persona === 'returner' ? COMING_BACK_NOTICES[this.state.persona] : null,
      wakeWindowNote: this.wakeWindowNote(date),
      streaks: this.streakBoard(date),
      upcoming: this.upcoming(date),
      activity: this.state.activity,
      summary: this.daySummary(date, occurrences),
    };
  }

  private nextScheduled(date: string): DayView['nextScheduled'] {
    return this.state.quests
      .filter(quest => quest.active)
      .map(quest => ({ questName: quest.name, date: nextOccurrenceAfter(quest.recurrence, date) }))
      .filter((entry): entry is { questName: string; date: string } => entry.date !== null)
      .reduce<DayView['nextScheduled']>((soonest, entry) => (soonest === null || entry.date < soonest.date ? entry : soonest), null);
  }

  private streakBoard(date: string): StreakBoardEntry[] {
    return this.state.quests
      .filter(quest => quest.active)
      .map(quest => {
        const progress = this.state.progress[quest.id] as QuestProgress;
        const week = Array.from({ length: 7 }, (_, index) => {
          const day = shiftDate(date, index - 6);
          if (!isScheduled(quest, day)) return 'upcoming' as OccurrenceState;
          return this.effectiveState(this.occurrence(quest, day), day);
        });
        return {
          questId: quest.id,
          questName: quest.name,
          label: this.streakLabel(progress),
          note: progress.currentStreakDays === 0 && progress.longestStreakDays >= 7 ? this.streakEndNote(quest, date) : null,
          week,
        };
      })
      .sort((a, b) => (this.state.progress[b.questId]?.currentStreakDays ?? 0) - (this.state.progress[a.questId]?.currentStreakDays ?? 0))
      .slice(0, 3);
  }

  private streakLabel(progress: QuestProgress): string {
    if (progress.currentStreakDays > 0) return `${progress.currentStreakDays} d`;
    return progress.longestStreakDays > 0 ? `ended at ${progress.longestStreakDays}` : 'not started';
  }

  /** Rollover writes a `missed` log for every day away, so the run closed on the first unshielded break after the last kept day, not the latest one. */
  private streakEndNote(quest: Quest, date: string): string {
    const logs = [...this.state.logs]
      .filter(([key]) => key.startsWith(`${quest.id}:`))
      .map(([key, log]) => ({ day: key.slice(quest.id.length + 1), log }))
      .filter(entry => entry.day <= date)
      .sort((a, b) => a.day.localeCompare(b.day));
    const lastHold = logs.filter(entry => HOLD_STATES.includes(entry.log.state)).at(-1)?.day;
    const breakLog = logs.find(entry => (lastHold === undefined || entry.day > lastHold) && BREAK_STATES.includes(entry.log.state) && !entry.log.shielded);
    const closedOn = breakLog?.day ?? (lastHold === undefined ? undefined : this.nextScheduledAfter(quest, lastHold, date));
    return closedOn ? `${closedAgo(closedOn, date)}. The record stays.` : 'The record stays.';
  }

  private nextScheduledAfter(quest: Quest, after: string, through: string): string | undefined {
    for (let day = shiftDate(after, 1); day <= through; day = shiftDate(day, 1)) if (isScheduled(quest, day)) return day;
    return undefined;
  }

  private hasActiveQuests(): boolean {
    return this.state.quests.some(quest => quest.active);
  }

  private timeOf(item: QuestOccurrence): number | null {
    return item.state === 'rescheduled' && item.rescheduledToMin !== null ? item.rescheduledToMin : item.startTimeMinutes;
  }

  private upcomingMeta(item: QuestOccurrence): string {
    if (item.state === 'rescheduled') return item.startTimeMinutes === null ? 'Today · moved' : `Today · moved from ${formatTime(item.startTimeMinutes)}`;
    return item.locked ? 'Today · locked plan' : 'Today';
  }

  private upcoming(date: string): DayView['upcoming'] {
    const later = this.scheduledOn(date)
      .filter(item => (item.state === 'upcoming' || item.state === 'rescheduled') && this.timeOf(item) !== null)
      .sort((a, b) => (this.timeOf(a) ?? 0) - (this.timeOf(b) ?? 0));
    const tomorrow = this.scheduledOn(shiftDate(date, 1)).slice(0, 2);
    const crown = this.state.hero.crown;
    return [
      ...later.slice(0, 2).map(item => ({ id: item.id, when: formatTime(this.timeOf(item)) ?? 'Today', title: item.questName, meta: this.upcomingMeta(item) })),
      ...tomorrow.map(item => ({ id: `${item.id}-next`, when: relativeDayLabel(item.date, date), title: item.questName, meta: formatTime(item.startTimeMinutes) ?? 'all day' })),
      ...(this.hasActiveQuests() ? [{ id: 'crown', when: relativeDayLabel(crown.closesOn, date), title: 'Crown closes', meta: `${crown.keptPercent}% kept so far` }] : []),
    ].slice(0, 4);
  }

  async getPlan(range: PlanRange): Promise<PlanView> {
    const from = range.scope === 'week' ? startOfWeek(range.anchor) : range.anchor;
    const weekStart = startOfWeek(range.anchor);
    const days = Array.from({ length: 7 }, (_, index) => this.planDay(shiftDate(weekStart, index)));
    const anchorDate = parseISODate(range.anchor) ?? new Date(range.anchor);
    const month = this.planMonth(anchorDate);
    const periodDays = range.scope === 'week' ? days : month.flatMap(cell => (cell.date ? [this.planDay(cell.date)] : []));
    const isCurrentWeek = this.state.today >= weekStart && this.state.today <= shiftDate(weekStart, 6);

    return {
      label: range.scope === 'week' ? formatRange(from, shiftDate(from, 6)) : formatMonth(range.anchor),
      from,
      to: range.scope === 'week' ? shiftDate(from, 6) : range.anchor,
      days,
      month,
      carryOver: range.scope === 'week' && isCurrentWeek ? this.carryOver() : null,
      crown: { ...this.state.hero.crown },
      rescheduleBudget: this.rescheduleBudget(),
      glance: this.glance(periodDays),
    };
  }

  /** Only counts a genuine miss (unlogged past occurrence), never a deliberate skip. */
  private carryOver(): PlanView['carryOver'] {
    const yesterday = shiftDate(this.state.today, -1);
    const missed = this.scheduledOn(yesterday).filter(item => this.effectiveState(item, yesterday) === 'missed');
    if (missed.length === 0) return null;

    const bestRunOf = (item: QuestOccurrence): number => (this.state.progress[item.questId] as QuestProgress | undefined)?.longestStreakDays ?? 0;
    const worst = [...missed].sort(
      (a, b) => this.recentMissCount(b.questId, yesterday) - this.recentMissCount(a.questId, yesterday) || bestRunOf(b) - bestRunOf(a),
    )[0] as QuestOccurrence;
    const commitments = missed.length === 1 ? 'one commitment' : `${missed.length} commitments`;
    const quest = this.questById(worst.questId);
    const progress = this.state.progress[worst.questId] as QuestProgress;

    return {
      title: `Yesterday left ${commitments} open`,
      body:
        quest && this.streakEndedFor(quest, progress, yesterday)
          ? `${worst.questName} was scheduled and not completed. Its best run, ${progress.longestStreakDays} days, stays in History. Review the quest, or leave it.`
          : `${worst.questName} was scheduled and not completed. The record stays in History. Review the quest, or leave it.`,
      questId: worst.questId,
    };
  }

  /** Missed scheduled occurrences in the RECENT_MISS_WINDOW_DAYS days up to and including `throughDate`. */
  private recentMissCount(questId: string, throughDate: string): number {
    const quest = this.questById(questId);
    if (!quest) return 0;
    let count = 0;
    for (let back = 0; back < RECENT_MISS_WINDOW_DAYS; back += 1) {
      const date = shiftDate(throughDate, -back);
      if (!isScheduled(quest, date) || this.effectiveState(this.occurrence(quest, date), date) !== 'missed') continue;
      count += 1;
    }
    return count;
  }

  /** Never claims a streak ended for a quest the server doesn't track one for, or when the server's own progress/shield says it didn't. */
  private streakEndedFor(quest: Quest, progress: QuestProgress, yesterday: string): boolean {
    if (quest.strictness === 'recovery') return false;
    if (quest.strictness === 'optional' && !quest.optionalStreakOptIn) return false;
    if (progress.longestStreakDays <= 0 || progress.currentStreakDays > 0) return false;
    return !this.state.logs.get(occurrenceKey(quest.id, yesterday))?.shielded;
  }

  private rescheduleBudget(): PlanView['rescheduleBudget'] {
    const busiest = this.state.quests
      .filter(quest => quest.active)
      .map(quest => ({ name: quest.name, progress: this.state.progress[quest.id] as QuestProgress }))
      .reduce<{ name: string; progress: QuestProgress } | null>((best, entry) => (entry.progress.reschedulesUsed > (best?.progress.reschedulesUsed ?? 0) ? entry : best), null);
    return { used: busiest?.progress.reschedulesUsed ?? 0, cap: busiest?.progress.rescheduleCap ?? RESCHEDULE_CAP, questName: busiest?.name ?? null };
  }

  private glance(days: PlanDay[]): string[] {
    const scheduled = days.reduce((total, day) => total + day.items.length, 0);
    const kept = days.reduce((total, day) => total + day.items.filter(item => item.state === 'completed').length, 0);
    const heaviest = days.reduce<PlanDay | null>((best, day) => (day.loadPercent > (best?.loadPercent ?? 0) ? day : best), null);
    const shields = Object.values(this.state.progress).reduce((total, item) => total + item.shields, 0);
    return [
      `${scheduled} occurrences scheduled · ${kept} kept so far`,
      ...(heaviest ? [`Heaviest day ${formatShortDate(heaviest.date)}`] : []),
      `HP ${this.state.hero.hp} of ${this.state.hero.hpMax} now`,
      `${shields} shields held now`,
    ];
  }

  /** A past occurrence nobody logged reads as missed on the board; the underlying log-derived state everywhere else is untouched. */
  private effectiveState(item: QuestOccurrence, date: string): OccurrenceState {
    return (item.state === 'upcoming' || item.state === 'rescheduled') && date < this.state.today ? 'missed' : item.state;
  }

  private planDay(date: string): PlanDay {
    const occurrences = this.scheduledOn(date);
    const minutes = occurrences.reduce((total, item) => total + item.durationMinutes, 0);
    const items: PlanItem[] = occurrences.map(item => {
      const state = this.effectiveState(item, date);
      return {
        occurrenceId: item.id,
        questId: item.questId,
        title: item.questName,
        meta: [formatTime(item.startTimeMinutes), state === 'upcoming' ? null : STATE_LABELS[state].toLowerCase()].filter(Boolean).join(' · ') || 'all day',
        state,
        shielded: this.state.logs.get(item.id)?.shielded ?? false,
      };
    });
    const capacityScale = SOFT_CAPACITY_MINUTES * LOAD_TRACK_SCALE;
    const overCapacity = minutes > SOFT_CAPACITY_MINUTES;

    return {
      date,
      isToday: date === this.state.today,
      locked: this.state.locks.has(date),
      loadPercent: Math.min(100, Math.round((minutes / capacityScale) * 100)),
      capacityMarkPercent: Math.round((SOFT_CAPACITY_MINUTES / capacityScale) * 100),
      overCapacity,
      loadSummary: `${occurrences.length} quests · about ${formatDuration(minutes)}${overCapacity ? ' · over capacity' : ''}`,
      items,
      note: this.lockNote(date),
    };
  }

  private lockNote(date: string): string | null {
    if (!this.state.locks.has(date)) return null;
    if (date < this.state.today) return 'This day was locked.';
    return 'Locked. Moves past the reschedule cap are recorded as postpones with a reason.';
  }

  private planMonth(anchor: Date): PlanMonthCell[] {
    const weeks = buildMonthMatrix(anchor.getFullYear(), anchor.getMonth(), 1);
    while (weeks.length > 1 && weeks[weeks.length - 1]?.every(day => day.getMonth() !== anchor.getMonth())) weeks.pop();

    return weeks.flat().map(day => {
      const date = toISODate(day);
      const inMonth = day.getMonth() === anchor.getMonth();
      return {
        date: inMonth ? date : null,
        inMonth,
        isToday: date === this.state.today,
        locked: this.state.locks.has(date),
        note: null,
        outcomes: inMonth ? this.scheduledOn(date).map(item => this.effectiveState(item, date)) : [],
      };
    });
  }

  async listQuests(filter: QuestFilter): Promise<QuestSummary[]> {
    return this.state.quests.filter(quest => (filter === 'all' ? true : filter === 'active' ? quest.active : !quest.active)).map(quest => this.summary(quest));
  }

  private summary(quest: Quest): QuestSummary {
    return {
      quest,
      progress: this.state.progress[quest.id] as QuestProgress,
      scheduleLocked: this.state.lockedQuestIdsByDate.get(this.state.today)?.has(quest.id) ?? false,
    };
  }

  async getQuest(questId: string): Promise<QuestDetail> {
    const quest = this.questById(questId);
    if (!quest) throw new Error(`Unknown quest ${questId}`);
    const history: QuestLogEntry[] = [];
    for (let back = 0; back < 30 && history.length < 5; back += 1) {
      const date = shiftDate(this.state.today, -back);
      const log = this.state.logs.get(occurrenceKey(questId, date));
      if (!log || log.state === 'upcoming') continue;
      history.push({ date, state: log.state as QuestLogEntry['state'], note: log.reasonTag ? `Reason: ${log.reasonTag.replace(/_/g, ' ')}` : `Recorded as ${log.state}` });
    }
    const weeklyMinutes = this.daysPerWeek(quest.recurrence) * quest.durationMinutes;
    const totalMinutes = this.state.quests.filter(item => item.active).reduce((total, item) => total + this.daysPerWeek(item.recurrence) * item.durationMinutes, 0);
    const cadence = quest.recurrence.frequency === 'monthly' ? 'once a month' : `${formatCount(this.daysPerWeek(quest.recurrence), 'day', 'days')} a week`;

    return {
      ...this.summary(quest),
      todayOccurrence: isScheduled(quest, this.state.today) ? this.occurrence(quest, this.state.today) : null,
      history,
      loadShare: totalMinutes === 0 ? 0 : weeklyMinutes / totalMinutes,
      loadSummary: `About ${formatDuration(quest.durationMinutes)} on the days it runs, ${cadence}.`,
    };
  }

  private daysPerWeek(recurrence: Recurrence): number {
    if (recurrence.frequency === 'monthly') return 12 / 52;
    return this.draftWeekdays(recurrence).length;
  }

  async previewDraft(draft: QuestDraft): Promise<QuestDraftPreview> {
    const draftDays = this.draftWeekdays(draft.recurrence);
    const days = WEEKDAYS.map(day => {
      const existing = this.state.quests.filter(quest => quest.active && quest.recurrence.daysOfWeek.includes(day)).reduce((total, quest) => total + quest.durationMinutes, 0);
      const minutes = existing + (draftDays.includes(day) ? draft.durationMinutes : 0);
      return { label: WEEKDAY_LABELS[day], minutes, percentOfCapacity: Math.round((minutes / SOFT_CAPACITY_MINUTES) * 100) };
    });
    const heaviest = days.reduce((worst, day) => (day.minutes > worst.minutes ? day : worst), days[0] as (typeof days)[number]);

    return {
      days,
      cadenceNote: draft.recurrence.frequency === 'daily' ? everyNDaysNote(draft.recurrence.interval, draftDays.length) : null,
      overloadNote:
        heaviest.percentOfCapacity > 100
          ? `${heaviest.label} would be the heaviest day — about ${formatDuration(heaviest.minutes)}, above your usual load. This is a note, not a limit.`
          : null,
    };
  }

  /** Mirrors `rules/recurrence.ts` on the server. */
  private draftWeekdays(recurrence: Recurrence): Weekday[] {
    if (recurrence.frequency !== 'daily') return recurrence.daysOfWeek;
    const start = recurrence.startDate === '' ? this.state.today : recurrence.startDate;
    const interval = Math.max(1, Math.trunc(recurrence.interval));
    return Array.from({ length: Math.ceil(PREVIEW_WINDOW_DAYS / interval) }, (_, index) => weekdayOf(shiftDate(start, index * interval)));
  }

  async findOccurrences(query: string, date: string): Promise<CaptureTarget[]> {
    return this.scheduledOn(date)
      .filter(item => matchQuestName(query, item.questName) !== null)
      .map(item => ({ occurrenceId: item.id, questId: item.questId, questName: item.questName, statAffinity: item.statAffinity }));
  }

  async dispatchCommand(command: Command): Promise<CommandResult> {
    switch (command.type) {
      case 'quest.complete':
        return this.resolve(command.occurrenceId, 'completed');
      case 'quest.partial':
        return this.resolve(command.occurrenceId, 'partial', { reasonTag: command.reasonTag, note: command.note, progress: command.progress });
      case 'quest.skip':
        return this.resolve(command.occurrenceId, 'skipped', { reasonTag: command.reasonTag, note: command.note });
      case 'quest.postpone':
        return this.resolve(command.occurrenceId, 'postponed', { reasonTag: command.reasonTag });
      case 'quest.reschedule':
        return this.reschedule(command.occurrenceId, command.toMin, command.acceptBeyondCap ?? false);
      case 'quest.deleteLog':
        return this.deleteLog(command.occurrenceId);
      case 'quest.create':
        return this.createQuest(command.draft);
      case 'quest.update':
        return this.updateQuest(command.questId, command.patch);
      case 'quest.setActive':
        return this.setQuestActive(command.questId, command.active);
      case 'plan.setLock':
        return this.setLock(command.date, command.locked, command.questIds);
    }
  }

  private resolve(occurrenceId: string, state: OccurrenceState, extra: { reasonTag?: ReasonTag; note?: string; progress?: number } = {}): CommandResult {
    const [questId, date] = occurrenceId.split(':') as [string, string];
    const quest = this.questById(questId);
    if (!quest) return { status: 'rejected', message: 'That quest is no longer in your plan.' };
    const progress = this.state.progress[questId] as QuestProgress;

    const base = state === 'partial' ? Math.floor(BASE_XP[quest.strictness] * 0.5) : state === 'completed' ? BASE_XP[quest.strictness] : 0;
    const xpAwarded = Math.min(XP_CEILING, Math.floor(base * streakTier(progress.currentStreakDays)));
    const coinsAwarded = state === 'completed' ? BASE_COINS[quest.strictness] : 0;
    const counted = streakApplies(quest);
    const holds = counted && HOLD_STATES.includes(state);
    const breaks = counted && BREAK_STATES.includes(state);
    const shielded = breaks && progress.shields > 0;

    this.state.logs.set(occurrenceId, {
      state,
      xpAwarded,
      coinsAwarded,
      reasonTag: extra.reasonTag ?? null,
      reasonNote: extra.note ?? null,
      rescheduledToMin: null,
      postponedTo: state === 'postponed' ? shiftDate(date, 1) : null,
      shielded,
      progress: extra.progress ?? null,
    });

    this.state.progress[questId] = {
      ...progress,
      currentStreakDays: holds ? progress.currentStreakDays + 1 : breaks && !shielded ? 0 : progress.currentStreakDays,
      longestStreakDays: Math.max(progress.longestStreakDays, holds ? progress.currentStreakDays + 1 : progress.longestStreakDays),
      shields: shielded ? progress.shields - 1 : breaks ? 0 : progress.shields,
      xpEarned: progress.xpEarned + xpAwarded,
    };

    // Server HP is charged by rollover when the day closes (`rules/hp.ts#computeDayHp`), never by the command, so today's HP must not move here.
    this.state.hero = {
      ...this.state.hero,
      xp: this.state.hero.xp + xpAwarded,
      xpIntoLevel: this.state.hero.xpIntoLevel + xpAwarded,
      coins: this.state.hero.coins + coinsAwarded,
    };
    if (state === 'postponed') this.breakLock(questId, date);
    this.pushActivity(`${quest.name} ${state}${xpAwarded > 0 ? ` · +${xpAwarded} XP` : ''}`, xpAwarded > 0);

    return { status: 'applied', message: this.messageFor(state, quest.name, xpAwarded), xpAwarded, coinsAwarded };
  }

  /** Server `resolveBreak` stamps `lockBrokenAt` on the open day only (`updateDailyStateIfOpen`), retiring that day's whole lock; a skip leaves it standing. */
  private breakLock(questId: string, date: string): void {
    if (date !== this.state.today || !this.state.lockedQuestIdsByDate.get(date)?.has(questId)) return;
    this.state.locks.delete(date);
    this.state.lockedQuestIdsByDate.delete(date);
  }

  /** Mirrors server `quest.deleteLog`: only the log goes; XP, coins, streak and shields already applied stay as they are. */
  private deleteLog(occurrenceId: string): CommandResult {
    const [questId] = occurrenceId.split(':') as [string, string];
    const quest = this.questById(questId);
    if (!quest || !this.state.logs.delete(occurrenceId)) return { status: 'rejected', message: 'There’s nothing logged for that quest to change.' };
    return { status: 'applied', message: `${quest.name} is open again.`, xpAwarded: 0, coinsAwarded: 0 };
  }

  private messageFor(state: OccurrenceState, name: string, xp: number): string {
    if (state === 'completed') return `${name} completed. +${xp} XP.`;
    if (state === 'partial') return `${name} recorded as partial. +${xp} XP, and the streak holds.`;
    if (state === 'skipped') return `${name} skipped. The reason is only ever shown to you.`;
    if (state === 'postponed') return `${name} moved to tomorrow.`;
    return `${name} recorded.`;
  }

  private reschedule(occurrenceId: string, toMin: number, acceptBeyondCap: boolean): CommandResult {
    const [questId, date] = occurrenceId.split(':') as [string, string];
    const quest = this.questById(questId);
    if (!quest) return { status: 'rejected', message: 'That quest is no longer in your plan.' };
    const progress = this.state.progress[questId] as QuestProgress;
    const toTime = formatTime(toMin);
    const counted = reschedulesCountedFor(progress.rescheduledDates, date);
    const overCap = counted.length >= progress.rescheduleCap;

    if (overCap && !acceptBeyondCap)
      return {
        status: 'needs-confirmation',
        kind: 'reschedule-cap',
        title: `${progress.rescheduleCap} reschedules used in the last 7 days`,
        body: `${progress.rescheduleCap} moves a week is the cap on ${STRICTNESS_LABELS[quest.strictness]} quests. Past it a move is recorded as a postpone with a reason instead of disappearing, so the history stays honest either way. The cap frees up for occurrences from ${formatShortDate(shiftDate(counted[counted.length - progress.rescheduleCap] as string, RESCHEDULE_WINDOW_DAYS))}.`,
        confirmLabel: 'Move it anyway',
        cancelLabel: 'Keep the plan',
        command: { type: 'quest.reschedule', occurrenceId, toMin, acceptBeyondCap: true },
      };

    if (overCap) return this.resolve(occurrenceId, 'postponed');
    if (progress.rescheduledDates.includes(date)) return { status: 'rejected', message: 'This occurrence has already been moved.' };

    const rescheduledDates = [...progress.rescheduledDates, date];
    this.state.progress[questId] = { ...progress, rescheduledDates, reschedulesUsed: reschedulesCountedFor(rescheduledDates, this.state.today).length };
    this.state.logs.set(occurrenceId, {
      state: 'rescheduled',
      xpAwarded: 0,
      coinsAwarded: 0,
      reasonTag: null,
      reasonNote: null,
      rescheduledToMin: toMin,
      postponedTo: null,
      shielded: false,
      progress: null,
    });
    this.pushActivity(`${quest.name} moved to ${toTime}`, false);

    return { status: 'applied', message: `${quest.name} moved to ${toTime}. The streak is untouched.`, xpAwarded: 0, coinsAwarded: 0 };
  }

  private createQuest(draft: QuestDraft): CommandResult {
    const id = `${
      draft.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'quest'
    }-${this.state.quests.length + 1}`;
    const now = this.state.today;
    this.state.quests = [...this.state.quests, { ...draft, id, createdAt: now, updatedAt: now }];
    this.state.progress[id] = {
      currentStreakDays: 0,
      longestStreakDays: 0,
      shields: 0,
      adherence30d: null,
      xpEarned: 0,
      reschedulesUsed: 0,
      rescheduleCap: RESCHEDULE_CAP,
      rescheduledDates: [],
      recentOutcomes: [],
    };
    return { status: 'applied', message: `${draft.name} is in your plan.`, xpAwarded: 0, coinsAwarded: 0 };
  }

  private updateQuest(questId: string, patch: Partial<QuestDraft>): CommandResult {
    const quest = this.questById(questId);
    if (!quest) return { status: 'rejected', message: 'That quest is no longer in your plan.' };
    this.state.quests = this.state.quests.map(item => (item.id === questId ? { ...item, ...patch, updatedAt: this.state.today } : item));
    return { status: 'applied', message: `${patch.name ?? quest.name} is saved. Changes apply to future occurrences.`, xpAwarded: 0, coinsAwarded: 0 };
  }

  private setQuestActive(questId: string, active: boolean): CommandResult {
    this.state.quests = this.state.quests.map(item => (item.id === questId ? { ...item, active, updatedAt: this.state.today } : item));
    return { status: 'applied', message: active ? 'Reactivated. A new streak starts from today.' : 'Paused. Its history and XP are kept.', xpAwarded: 0, coinsAwarded: 0 };
  }

  /** Mirrors `daily_states`: one calendar day, locked with exactly the ids it's asked to lock. */
  private setLock(date: string, locked: boolean, questIds: string[]): CommandResult {
    if (locked && date !== this.state.today) return { status: 'rejected', message: 'Only today’s plan can be locked.' };
    if (locked && questIds.length === 0) return { status: 'rejected', message: 'Nothing is scheduled today to lock.' };
    if (locked) {
      this.state.locks.add(date);
      this.state.lockedQuestIdsByDate.set(date, new Set(questIds));
    } else {
      this.state.locks.delete(date);
      this.state.lockedQuestIdsByDate.delete(date);
    }
    return { status: 'applied', message: locked ? "Today's plan is locked in." : "Today's plan is open again.", xpAwarded: 0, coinsAwarded: 0 };
  }

  private pushActivity(text: string, rewarded: boolean): void {
    this.state.activity = [{ id: `act-${this.state.activity.length + 1}`, text, when: 'just now', rewarded }, ...this.state.activity].slice(0, 8);
  }
}

export function createFixtureProvider(options?: FixtureProviderOptions): DataProvider {
  return new MemoirEngine(seedWorldState(options));
}
