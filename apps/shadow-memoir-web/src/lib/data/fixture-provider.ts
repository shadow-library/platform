import { buildMonthMatrix, parseISODate, toISODate } from '@shadow-library/ui';

import { type Command, type CommandResult } from './command.types';
import { type DataProvider, type PlanRange, type QuestFilter } from './data-provider';
import { getFinanceProvider } from './finance.provider';
import { isCurrencyCode } from './finance.rules';
import { getQuickLogProvider } from './quick-logs.provider';
import { lbToKg } from './quick-logs.rules';
import { type Persona, QUICK_LOG_TILES, seed } from './fixtures';
import { formatDuration, formatMonth, formatRange, formatTime, shiftDate, startOfWeek, STATE_LABELS, STRICTNESS_LABELS, WEEKDAY_LABELS, weekdayOf, WEEKDAYS } from './labels';
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
  type Strictness,
} from './quest.types';
import {
  type ActivityEntry,
  type CaptureTarget,
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
const HP_COST: Record<Strictness, number> = { anchor: 1, routine: 1, goal: 0, recovery: 0, optional: 0 };
const XP_CEILING = 25;
const SOFT_CAPACITY_MINUTES = 150;

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
  persona: Persona;
  quests: Quest[];
  progress: Record<string, QuestProgress>;
  logs: Map<string, LogRecord>;
  hero: HeroState;
  activity: ActivityEntry[];
  metrics: Record<string, number>;
  locks: Set<string>;
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
  if (quest.recurrence.exceptions.includes(date)) return false;
  return quest.recurrence.daysOfWeek.includes(weekdayOf(date));
}

function scheduleSummary(quest: Quest): string {
  const days = quest.recurrence.daysOfWeek;
  const span = days.length === 7 ? 'Every day' : days.length === 6 && !days.includes('sun') ? 'Mon–Sat' : days.map(day => WEEKDAY_LABELS[day]).join(' / ');
  const time = formatTime(quest.startTimeMinutes);
  return time ? `${span} · ${time}` : `${span} · all day`;
}

function relativeDayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === shiftDate(today, 1)) return 'Tomorrow';
  const parsed = parseISODate(date);
  return parsed ? WEEKDAY_LABELS[WEEKDAYS[(parsed.getDay() + 6) % 7] as keyof typeof WEEKDAY_LABELS] : date;
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

export function seedWorldState(options: FixtureProviderOptions = {}): MemoirWorldState {
  const today = options.today ?? toISODate(new Date());
  const persona = options.persona ?? 'active';
  const seeded = seed(today, persona);
  const state: MemoirWorldState = {
    today,
    persona,
    quests: seeded.quests,
    progress: seeded.progress,
    logs: new Map(),
    hero: seeded.hero,
    activity: seeded.activity,
    metrics: seeded.metrics,
    locks: persona === 'active' ? new Set([today, shiftDate(today, 1)]) : new Set(),
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
  constructor(private readonly state: MemoirWorldState) {}

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
      locked: quest.preCommit && this.state.locks.has(date),
      queued: false,
      threshold: quest.healthThreshold
        ? {
            metric: quest.healthThreshold.metric,
            unit: quest.healthThreshold.unit,
            target: quest.healthThreshold.target,
            current: this.state.metrics[quest.healthThreshold.metric] ?? 0,
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

  async getDay(date: string): Promise<DayView> {
    const occurrences = this.scheduledOn(date);
    const resolved = occurrences.filter(item => item.state !== 'upcoming');
    const completed = occurrences.filter(item => item.state === 'completed' || item.state === 'partial');
    const skipped = occurrences.filter(item => item.state === 'skipped');

    return {
      date,
      mode: this.state.persona,
      hero: { ...this.state.hero, crown: { ...this.state.hero.crown } },
      occurrences,
      recovery:
        this.state.persona === 'recovery'
          ? {
              title: 'Comeback week — three days back after eight away',
              body: 'Your streaks from before the break are kept as history, and your XP was never touched. The load is reduced to three quests a day until Sunday, and two shields are active. You can lift the reduction whenever you want.',
            }
          : null,
      wakeWindowNote: this.state.persona === 'recovery' ? 'no HP at stake today' : 'about 1h 20m of wake window left',
      quickLogs: QUICK_LOG_TILES,
      streaks: this.streakBoard(date),
      upcoming: this.upcoming(date),
      activity: this.state.activity,
      summary:
        resolved.length === 0
          ? null
          : {
              headline: 'End of day',
              detail: [
                `${completed.length} of ${occurrences.length} quests completed.`,
                skipped.length > 0 ? `${skipped.length} skipped with a reason.` : null,
                '2 quick logs.',
                '€18.40 spent.',
                `HP ${this.state.hero.hp} of ${this.state.hero.hpMax}.`,
              ]
                .filter(Boolean)
                .join(' '),
            },
    };
  }

  private streakBoard(date: string): StreakBoardEntry[] {
    return this.state.quests
      .filter(quest => quest.active)
      .map(quest => {
        const progress = this.state.progress[quest.id] as QuestProgress;
        const week = Array.from({ length: 7 }, (_, index) => {
          const day = shiftDate(date, index - 6);
          if (!isScheduled(quest, day)) return 'upcoming' as OccurrenceState;
          return this.state.logs.get(occurrenceKey(quest.id, day))?.state ?? ('upcoming' as OccurrenceState);
        });
        return {
          questId: quest.id,
          questName: quest.name,
          label: progress.currentStreakDays > 0 ? `${progress.currentStreakDays} d` : `ended at ${progress.longestStreakDays}`,
          note: progress.currentStreakDays === 0 && progress.longestStreakDays >= 7 ? 'Closed yesterday. The record stays.' : null,
          week,
        };
      })
      .sort((a, b) => (this.state.progress[b.questId]?.currentStreakDays ?? 0) - (this.state.progress[a.questId]?.currentStreakDays ?? 0))
      .slice(0, 3);
  }

  private upcoming(date: string): DayView['upcoming'] {
    const later = this.scheduledOn(date).filter(item => item.state === 'upcoming' && item.startTimeMinutes !== null);
    const tomorrow = this.scheduledOn(shiftDate(date, 1)).slice(0, 2);
    const crown = this.state.hero.crown;
    return [
      ...later
        .slice(0, 2)
        .map(item => ({ id: item.id, when: formatTime(item.startTimeMinutes) ?? 'Today', title: item.questName, meta: item.locked ? 'Today · locked plan' : 'Today' })),
      ...tomorrow.map(item => ({ id: `${item.id}-next`, when: relativeDayLabel(item.date, date), title: item.questName, meta: formatTime(item.startTimeMinutes) ?? 'all day' })),
      { id: 'crown', when: `day ${crown.dayCount}`, title: 'Crown period closes', meta: `${crown.keptPercent}% kept so far` },
    ].slice(0, 4);
  }

  async getPlan(range: PlanRange): Promise<PlanView> {
    const from = range.scope === 'week' ? startOfWeek(range.anchor) : range.anchor;
    const days = Array.from({ length: 7 }, (_, index) => this.planDay(shiftDate(startOfWeek(range.anchor), index)));
    const carryMiss = this.scheduledOn(shiftDate(this.state.today, -1)).find(item => item.state === 'missed');
    const anchorDate = parseISODate(range.anchor) ?? new Date(range.anchor);

    return {
      label: range.scope === 'week' ? formatRange(from, shiftDate(from, 6)) : formatMonth(range.anchor),
      from,
      to: range.scope === 'week' ? shiftDate(from, 6) : range.anchor,
      days,
      month: this.planMonth(anchorDate),
      carryOver: carryMiss
        ? {
            title: 'Yesterday left one commitment open',
            body: `${carryMiss.questName} was scheduled and not completed. Its streak closed at 9 days — the record stays in History. You can add it to today as a recovery quest, or leave it.`,
          }
        : null,
      crown: { ...this.state.hero.crown },
      rescheduleBudget: { used: this.state.progress['read-pages']?.reschedulesUsed ?? 0, cap: 2, resetsOn: shiftDate(startOfWeek(this.state.today), 7) },
      glance: [
        `${days.reduce((total, day) => total + day.items.length, 0)} occurrences scheduled · ${days.reduce((total, day) => total + day.items.filter(item => item.state === 'completed').length, 0)} kept so far`,
        `HP ${this.state.hero.hp} of ${this.state.hero.hpMax}`,
        `${Object.values(this.state.progress).reduce((total, item) => total + item.shields, 0)} shields held`,
        `Heaviest day ${days.reduce((heaviest, day) => (day.loadPercent > heaviest.loadPercent ? day : heaviest), days[0] as PlanDay).date}`,
      ],
    };
  }

  private planDay(date: string): PlanDay {
    const occurrences = this.scheduledOn(date);
    const minutes = occurrences.reduce((total, item) => total + item.durationMinutes, 0);
    const items: PlanItem[] = occurrences.map(item => ({
      occurrenceId: item.id,
      questId: item.questId,
      title: item.questName,
      meta: [formatTime(item.startTimeMinutes), item.state === 'upcoming' ? null : STATE_LABELS[item.state].toLowerCase()].filter(Boolean).join(' · ') || 'all day',
      state: item.state,
      shielded: this.state.logs.get(item.id)?.shielded ?? false,
    }));
    const loadPercent = Math.min(100, Math.round((minutes / SOFT_CAPACITY_MINUTES) * 100));

    return {
      date,
      isToday: date === this.state.today,
      locked: this.state.locks.has(date),
      loadPercent,
      loadSummary: `${occurrences.length} quests · about ${formatDuration(minutes)}`,
      items,
      note: this.state.locks.has(date) ? 'Plan locked until Monday. Moves past the cap are recorded as skips with a reason.' : null,
    };
  }

  private planMonth(anchor: Date): PlanMonthCell[] {
    return buildMonthMatrix(anchor.getFullYear(), anchor.getMonth(), 1)
      .flat()
      .map(day => {
        const date = toISODate(day);
        const inMonth = day.getMonth() === anchor.getMonth();
        return {
          date: inMonth ? date : null,
          inMonth,
          isToday: date === this.state.today,
          locked: this.state.locks.has(date),
          note: null,
          outcomes: inMonth ? this.scheduledOn(date).map(item => item.state) : [],
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
      scheduleLocked: quest.preCommit && this.state.locks.has(this.state.today),
      scheduleSummary: scheduleSummary(quest),
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
    const weeklyMinutes = quest.recurrence.daysOfWeek.length * quest.durationMinutes;
    const totalMinutes = this.state.quests.filter(item => item.active).reduce((total, item) => total + item.recurrence.daysOfWeek.length * item.durationMinutes, 0);

    return {
      ...this.summary(quest),
      todayOccurrence: isScheduled(quest, this.state.today) ? this.occurrence(quest, this.state.today) : null,
      history,
      loadShare: totalMinutes === 0 ? 0 : weeklyMinutes / totalMinutes,
      loadSummary: `About ${formatDuration(quest.durationMinutes)} on the days it runs, ${quest.recurrence.daysOfWeek.length} days a week.`,
    };
  }

  async previewDraft(draft: QuestDraft): Promise<QuestDraftPreview> {
    const days = WEEKDAYS.map(day => {
      const existing = this.state.quests.filter(quest => quest.active && quest.recurrence.daysOfWeek.includes(day)).reduce((total, quest) => total + quest.durationMinutes, 0);
      const minutes = existing + (draft.recurrence.daysOfWeek.includes(day) ? draft.durationMinutes : 0);
      return { label: WEEKDAY_LABELS[day], minutes, percentOfCapacity: Math.round((minutes / SOFT_CAPACITY_MINUTES) * 100) };
    });
    const heaviest = days.reduce((worst, day) => (day.minutes > worst.minutes ? day : worst), days[0] as (typeof days)[number]);

    return {
      days,
      overloadNote:
        heaviest.percentOfCapacity > 100
          ? `${heaviest.label} would be the heaviest day — about ${formatDuration(heaviest.minutes)}, above your usual load. This is a note, not a limit.`
          : null,
    };
  }

  async findOccurrences(query: string, date: string): Promise<CaptureTarget[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return this.scheduledOn(date)
      .filter(item => terms.every(term => item.questName.toLowerCase().includes(term)))
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
      case 'quest.create':
        return this.createQuest(command.draft);
      case 'quest.update':
        return this.updateQuest(command.questId, command.patch);
      case 'quest.setActive':
        return this.setQuestActive(command.questId, command.active);
      case 'plan.setLock':
        return this.setLock(command.from, command.to, command.locked);
      default:
        return this.logCapture(command);
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
    const holds = state === 'completed' || state === 'partial' || state === 'recovery';
    const shielded = !holds && progress.shields > 0;

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
      currentStreakDays: holds ? progress.currentStreakDays + 1 : shielded ? progress.currentStreakDays : 0,
      longestStreakDays: Math.max(progress.longestStreakDays, holds ? progress.currentStreakDays + 1 : progress.longestStreakDays),
      shields: shielded ? progress.shields - 1 : holds ? progress.shields : 0,
      xpEarned: progress.xpEarned + xpAwarded,
    };

    const hpCost = holds || shielded ? 0 : HP_COST[quest.strictness];
    this.state.hero = {
      ...this.state.hero,
      xp: this.state.hero.xp + xpAwarded,
      xpIntoLevel: this.state.hero.xpIntoLevel + xpAwarded,
      coins: this.state.hero.coins + coinsAwarded,
      hp: Math.max(0, this.state.hero.hp - hpCost),
    };
    this.pushActivity(`${quest.name} ${state}${xpAwarded > 0 ? ` · +${xpAwarded} XP` : ''}`, xpAwarded > 0);

    return { status: 'applied', message: this.messageFor(state, quest.name, xpAwarded), xpAwarded, coinsAwarded };
  }

  private messageFor(state: OccurrenceState, name: string, xp: number): string {
    if (state === 'completed') return `${name} completed. +${xp} XP.`;
    if (state === 'partial') return `${name} recorded as partial. +${xp} XP, and the streak holds.`;
    if (state === 'skipped') return `${name} skipped. The reason is only ever shown to you.`;
    if (state === 'postponed') return `${name} moved to tomorrow.`;
    return `${name} recorded.`;
  }

  private reschedule(occurrenceId: string, toMin: number, acceptBeyondCap: boolean): CommandResult {
    const [questId] = occurrenceId.split(':') as [string, string];
    const quest = this.questById(questId);
    if (!quest) return { status: 'rejected', message: 'That quest is no longer in your plan.' };
    const progress = this.state.progress[questId] as QuestProgress;
    const toTime = formatTime(toMin);

    if (progress.reschedulesUsed >= progress.rescheduleCap && !acceptBeyondCap)
      return {
        status: 'needs-confirmation',
        kind: 'reschedule-cap',
        title: `${progress.rescheduleCap} reschedules used in the last 7 days`,
        body: `${progress.rescheduleCap} moves a week is the cap on ${STRICTNESS_LABELS[quest.strictness]} quests. Past it a move is recorded as a postpone with a reason instead of disappearing, so the history stays honest either way. The cap frees up on ${shiftDate(this.state.today, 7)}.`,
        confirmLabel: 'Move it anyway',
        cancelLabel: 'Keep the plan',
        command: { type: 'quest.reschedule', occurrenceId, toMin, acceptBeyondCap: true },
      };

    if (progress.reschedulesUsed >= progress.rescheduleCap) return this.resolve(occurrenceId, 'postponed');

    this.state.progress[questId] = { ...progress, reschedulesUsed: progress.reschedulesUsed + 1 };
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
      rescheduleCap: 2,
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

  private setLock(from: string, to: string, locked: boolean): CommandResult {
    for (let date = from; date <= to; date = shiftDate(date, 1)) {
      if (locked) this.state.locks.add(date);
      else this.state.locks.delete(date);
    }
    return { status: 'applied', message: locked ? 'The plan is committed for this week.' : 'The plan is open again.', xpAwarded: 0, coinsAwarded: 0 };
  }

  private async logCapture(command: Command): Promise<CommandResult> {
    await recordInOwningDomain(command, this.state.today);
    const described = this.describeCapture(command);
    this.pushActivity(described.text, described.xp > 0);
    this.state.hero = { ...this.state.hero, xp: this.state.hero.xp + described.xp, xpIntoLevel: this.state.hero.xpIntoLevel + described.xp };
    return { status: 'applied', message: described.message, xpAwarded: described.xp, coinsAwarded: 0 };
  }

  private describeCapture(command: Command): { text: string; message: string; xp: number } {
    switch (command.type) {
      case 'expense.record':
        return {
          text: `${(command.amountMinor / 100).toFixed(2)} ${command.currency} · ${command.note || 'uncategorised'}`,
          message: 'Logged to today. It appears in Money and in History.',
          xp: 0,
        };
      case 'metric.record':
        this.state.metrics[command.metric] = command.value;
        return { text: `${command.metric} ${command.value}`, message: 'Logged to today. It replaces the earlier value for the day.', xp: 0 };
      case 'weight.record':
        return { text: `Weight ${command.value} ${command.unit}`, message: 'Logged to today. The earlier value stays in History as corrected.', xp: 0 };
      case 'journal.record':
        return { text: `Journal entry · ${command.text.split(/\s+/).length} words`, message: 'Saved to today’s journal.', xp: 5 };
      case 'sideQuest.record':
        return { text: `Side quest: ${command.text} · +5 XP`, message: 'Logged as a side quest. +5 XP.', xp: 5 };
      default:
        return { text: 'Entry recorded', message: 'Logged to today.', xp: 0 };
    }
  }

  private pushActivity(text: string, rewarded: boolean): void {
    this.state.activity = [{ id: `act-${this.state.activity.length + 1}`, text, when: 'just now', rewarded }, ...this.state.activity].slice(0, 8);
  }
}

/**
 * Quick Capture parses into one Command union, but the record it produces belongs to whichever domain owns
 * it — Money keeps expenses, the quick-log surfaces keep journal, weight, metrics and side quests. Without
 * this hop a captured entry would reach the day's feed and never its own screen. The XP the palette reports
 * stays this provider's, so forwarding cannot grant a second time.
 */
async function recordInOwningDomain(command: Command, today: string): Promise<void> {
  switch (command.type) {
    case 'expense.record':
      await getFinanceProvider().dispatchCommand({
        type: 'expense.create',
        draft: {
          amountText: (command.amountMinor / 100).toFixed(2),
          currency: isCurrencyCode(command.currency) ? command.currency : 'EUR',
          categoryId: 'uncat',
          occurredOnDate: today,
          note: command.note,
        },
      });
      return;
    case 'journal.record':
      await getQuickLogProvider().dispatchCommand({ type: 'journal.save', draft: { date: today, text: command.text, mood: null } });
      return;
    case 'weight.record':
      // The palette has nowhere to ask, and its own copy already promises the earlier value is kept.
      await getQuickLogProvider().dispatchCommand({
        type: 'weight.save',
        date: today,
        kg: command.unit === 'lb' ? lbToKg(command.value) : command.value,
        confirmedReplacement: true,
      });
      return;
    case 'sideQuest.record':
      await getQuickLogProvider().dispatchCommand({ type: 'sidequest.log', draft: { date: today, name: command.text, statAffinity: command.statAffinity } });
      return;
    case 'metric.record':
      await getQuickLogProvider().dispatchCommand({ type: 'health.save', key: command.metric, date: today, value: command.value });
      return;
    default:
      return;
  }
}

export function createFixtureProvider(options?: FixtureProviderOptions): DataProvider {
  return new MemoirEngine(seedWorldState(options));
}
