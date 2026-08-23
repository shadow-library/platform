import {
  type LogRecord,
  type MemoirWorldState,
  type Momentum,
  type Quest,
  type QuestProgress,
  type Recurrence,
  type StatAffinity,
  type Strictness,
  type Weekday,
} from '@/lib/data';

import { type DeltaRow, type SyncDomain } from './sync.types';

export type DomainRows = Record<SyncDomain, DeltaRow[]>;

const MOMENTUM_STATES: Momentum[] = ['cold', 'steady', 'warm'];

function toMomentum(value: string | null): Momentum {
  return MOMENTUM_STATES.find(state => state === value) ?? 'steady';
}

/**
 * The level curve is a *server* rule (`rules/level.ts`), and the ruleset it reads is not shipped to the
 * client yet — ARCHITECTURE §12.1 wants the same versioned module on both sides, which is its own task.
 * Until then the account row's authoritative `level`, `totalXp`, `coins` and HP are projected verbatim and
 * the two derived bar values are left at the point the server last placed them.
 */
const XP_PER_LEVEL = 250;

function text(row: DeltaRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function number(row: DeltaRow, key: string, fallback = 0): number {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
}

function bool(row: DeltaRow, key: string, fallback = false): boolean {
  const value = row[key];
  return typeof value === 'boolean' ? value : fallback;
}

const WEEKDAY_LOCAL: Record<number, Weekday> = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };

/** The server persists the rules module's `RecurrenceRule` (numeric 1–7 weekdays, a monthly `pattern` discriminant); this reverses `toRecurrenceRule` in `command-wire.ts` back to the web's flatter `Recurrence` draft shape. */
function toRecurrence(value: unknown): Recurrence {
  const rule = (value ?? {}) as Record<string, unknown>;
  const daysOfWeek = Array.isArray(rule['daysOfWeek']) ? (rule['daysOfWeek'] as number[]).map(day => WEEKDAY_LOCAL[day] ?? 'mon') : [];
  const pattern = rule['pattern'] as { kind?: string; dayOfMonth?: number } | undefined;
  return {
    frequency: (rule['frequency'] as Recurrence['frequency']) ?? 'daily',
    interval: typeof rule['interval'] === 'number' ? rule['interval'] : 1,
    daysOfWeek,
    dayOfMonth: pattern?.kind === 'day_of_month' && typeof pattern.dayOfMonth === 'number' ? pattern.dayOfMonth : null,
    startDate: typeof rule['startDate'] === 'string' ? rule['startDate'] : '',
    end: (rule['end'] as Recurrence['end']) ?? { kind: 'never' },
    exceptions: Array.isArray(rule['exceptions']) ? (rule['exceptions'] as string[]) : [],
  };
}

function toQuest(row: DeltaRow): Quest {
  const threshold = row['healthThreshold'] as Quest['healthThreshold'];
  return {
    id: String(row['id']),
    name: text(row, 'name') ?? 'Quest',
    notes: text(row, 'notes'),
    startTimeMinutes: row['startTimeMin'] === null || row['startTimeMin'] === undefined ? null : number(row, 'startTimeMin'),
    durationMinutes: number(row, 'durationMin'),
    statAffinity: (text(row, 'statAffinity') ?? 'discipline') as StatAffinity,
    strictness: (text(row, 'strictness') ?? 'routine') as Strictness,
    optionalStreakOptIn: bool(row, 'optionalStreakOptIn'),
    recurrence: toRecurrence(row['recurrence']),
    consequences: [],
    moduleLink: (text(row, 'moduleLink') ?? null) as Quest['moduleLink'],
    notification: { enabled: bool(row, 'reminderEnabled'), leadMinutes: number(row, 'reminderLeadMin') },
    healthThreshold: threshold ?? null,
    preCommit: false,
    active: bool(row, 'active', true),
    createdAt: text(row, 'createdAt') ?? '',
    updatedAt: text(row, 'updatedAt') ?? '',
  };
}

function toLogRecord(row: DeltaRow): LogRecord {
  return {
    state: (text(row, 'state') ?? 'completed') as LogRecord['state'],
    xpAwarded: number(row, 'xpAwarded'),
    coinsAwarded: number(row, 'coinsAwarded'),
    reasonTag: text(row, 'reasonTag') as LogRecord['reasonTag'],
    reasonNote: text(row, 'reasonNote'),
    rescheduledToMin: row['rescheduledToMin'] === null || row['rescheduledToMin'] === undefined ? null : number(row, 'rescheduledToMin'),
    postponedTo: text(row, 'postponedToDate'),
    shielded: false,
    progress: null,
  };
}

function toProgress(row: DeltaRow): QuestProgress {
  return {
    currentStreakDays: number(row, 'currentRunDays'),
    longestStreakDays: number(row, 'bestRunDays'),
    shields: number(row, 'shieldsAvailable'),
    adherence30d: null,
    xpEarned: 0,
    reschedulesUsed: 0,
    rescheduleCap: 2,
    recentOutcomes: [],
  };
}

const EMPTY_PROGRESS: QuestProgress = {
  currentStreakDays: 0,
  longestStreakDays: 0,
  shields: 0,
  adherence30d: null,
  xpEarned: 0,
  reschedulesUsed: 0,
  rescheduleCap: 2,
  recentOutcomes: [],
};

/**
 * Rebuilds the engine's world from the rows the delta pull has left in IndexedDB. It is deliberately total:
 * a domain the server has not yet populated projects to an empty set rather than to a hole, so each domain
 * flips from fixture-backed to live on its own without the projection learning about the others.
 */
export function projectWorldState(rows: Partial<DomainRows>, today: string): MemoirWorldState {
  const quests = (rows.quests ?? []).map(toQuest);
  const account = rows.account?.[0];

  const progress: Record<string, QuestProgress> = {};
  for (const quest of quests) progress[quest.id] = EMPTY_PROGRESS;
  for (const row of rows.quest_streaks ?? []) progress[String(row['questId'])] = toProgress(row);

  const logs = new Map<string, LogRecord>();
  for (const row of rows.quest_logs ?? []) logs.set(`${String(row['questId'])}:${String(row['date'])}`, toLogRecord(row));

  const locks = new Set<string>();
  const lockedQuestIds = new Set<string>();
  for (const row of rows.daily_states ?? []) {
    if (row['committedAt'] === null || row['committedAt'] === undefined) continue;
    locks.add(String(row['date']));
    for (const questId of (row['lockedQuestIds'] as unknown[] | undefined) ?? []) lockedQuestIds.add(String(questId));
  }

  const totalXp = account ? number(account, 'totalXp') : 0;
  const level = account ? number(account, 'level', 1) : 1;

  return {
    today,
    persona: 'active',
    quests: quests.map(quest => ({ ...quest, preCommit: lockedQuestIds.has(quest.id) })),
    progress,
    logs,
    hero: {
      level,
      title: '',
      coins: account ? number(account, 'coins') : 0,
      xp: totalXp,
      xpIntoLevel: totalXp % XP_PER_LEVEL,
      xpForNextLevel: XP_PER_LEVEL,
      hp: account ? number(account, 'hpToday') : 0,
      hpMax: account ? number(account, 'hpMax', 3) : 3,
      momentum: toMomentum(account ? text(account, 'warmthState') : null),
      crown: { label: '', dayIndex: 0, dayCount: 7, keptPercent: 0 },
    },
    activity: [],
    metrics: {},
    locks,
  };
}

/**
 * The world an owner sees before the first delta has landed. Deliberately the empty projection rather than
 * the fixtures: the quest domain is authoritative the moment the server answers, and seeding invented
 * quests into a real account would show the owner a plan that is not theirs.
 */
export function emptyWorldState(today: string): MemoirWorldState {
  return projectWorldState({}, today);
}
