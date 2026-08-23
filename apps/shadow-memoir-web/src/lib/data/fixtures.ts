import { type OccurrenceState, type Quest, type QuestProgress, type Recurrence, type StatAffinity, type Strictness, type Weekday } from './quest.types';
import { shiftDate, WEEKDAYS } from './labels';
import { type ActivityEntry, type HeroState, type QuickLogTile } from './view.types';

export type Persona = 'new' | 'active' | 'recovery';

function recurrence(days: Weekday[], startDate: string): Recurrence {
  return { frequency: 'weekly', interval: 1, daysOfWeek: days, dayOfMonth: null, startDate, end: { kind: 'never' }, exceptions: [] };
}

interface QuestSeed {
  id: string;
  name: string;
  statAffinity: StatAffinity;
  strictness: Strictness;
  days: Weekday[];
  startTimeMinutes: number | null;
  durationMinutes: number;
  active?: boolean;
  preCommit?: boolean;
  notes?: string;
  moduleLink?: Quest['moduleLink'];
  threshold?: Quest['healthThreshold'];
  consequences?: Quest['consequences'];
  progress: QuestProgress;
}

const EVERY_DAY = WEEKDAYS;
const WEEKDAYS_PLUS_SAT: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function outcomes(pattern: OccurrenceState[], length = 30): OccurrenceState[] {
  return Array.from({ length }, (_, index) => pattern[index % pattern.length] as OccurrenceState);
}

function progress(partial: Partial<QuestProgress>): QuestProgress {
  return {
    currentStreakDays: 0,
    longestStreakDays: 0,
    shields: 0,
    adherence30d: null,
    xpEarned: 0,
    reschedulesUsed: 0,
    rescheduleCap: 2,
    recentOutcomes: outcomes(['completed']),
    ...partial,
  };
}

const ACTIVE_SEEDS: QuestSeed[] = [
  {
    id: 'morning-run',
    name: 'Morning run — 5 km',
    statAffinity: 'body',
    strictness: 'routine',
    days: WEEKDAYS_PLUS_SAT,
    startTimeMinutes: 420,
    durationMinutes: 35,
    notes: 'Out the door before the day starts asking for anything.',
    consequences: [{ metric: 'distance', fullValue: 5, unit: 'km', partialMode: 'actual' }],
    progress: progress({
      currentStreakDays: 12,
      longestStreakDays: 41,
      shields: 2,
      adherence30d: 0.86,
      xpEarned: 3240,
      recentOutcomes: outcomes(['completed', 'completed', 'completed', 'partial', 'completed', 'completed', 'skipped']),
    }),
  },
  {
    id: 'read-pages',
    name: 'Read 20 pages',
    statAffinity: 'mind',
    strictness: 'goal',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 25,
    consequences: [{ metric: 'pages', fullValue: 20, unit: 'pages', partialMode: 'scaled' }],
    progress: progress({ currentStreakDays: 31, longestStreakDays: 41, shields: 2, adherence30d: 0.94, xpEarned: 2480, reschedulesUsed: 1 }),
  },
  {
    id: 'move-steps',
    name: 'Move 8,000 steps',
    statAffinity: 'body',
    strictness: 'routine',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 40,
    threshold: { metric: 'steps', target: 8000, unit: 'steps' },
    progress: progress({
      currentStreakDays: 5,
      longestStreakDays: 22,
      shields: 1,
      adherence30d: 0.79,
      xpEarned: 1420,
      recentOutcomes: outcomes(['completed', 'completed', 'missed', 'completed', 'partial']),
    }),
  },
  {
    id: 'strength-session',
    name: 'Strength session',
    statAffinity: 'body',
    strictness: 'anchor',
    days: ['tue', 'thu', 'sat'],
    startTimeMinutes: 1080,
    durationMinutes: 50,
    preCommit: true,
    progress: progress({
      currentStreakDays: 7,
      longestStreakDays: 19,
      shields: 1,
      adherence30d: 0.71,
      xpEarned: 1960,
      reschedulesUsed: 2,
      recentOutcomes: outcomes(['completed', 'skipped', 'completed', 'completed']),
    }),
  },
  {
    id: 'no-takeaway',
    name: 'No takeaway today',
    statAffinity: 'wealth',
    strictness: 'goal',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 0,
    progress: progress({
      currentStreakDays: 4,
      longestStreakDays: 18,
      adherence30d: 0.68,
      xpEarned: 860,
      recentOutcomes: outcomes(['completed', 'completed', 'skipped', 'completed', 'missed']),
    }),
  },
  {
    id: 'budget-review',
    name: 'Weekly budget review',
    statAffinity: 'wealth',
    strictness: 'routine',
    days: ['sun'],
    startTimeMinutes: 1200,
    durationMinutes: 30,
    progress: progress({ currentStreakDays: 63, longestStreakDays: 63, shields: 2, adherence30d: 1, xpEarned: 940 }),
  },
  {
    id: 'evening-stretch',
    name: 'Evening stretch',
    statAffinity: 'body',
    strictness: 'optional',
    days: EVERY_DAY,
    startTimeMinutes: 1290,
    durationMinutes: 15,
    progress: progress({
      currentStreakDays: 0,
      longestStreakDays: 9,
      adherence30d: 0.62,
      xpEarned: 620,
      recentOutcomes: outcomes(['completed', 'completed', 'completed', 'missed']),
    }),
  },
  {
    id: 'journal-line',
    name: 'Journal a line',
    statAffinity: 'mind',
    strictness: 'goal',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 10,
    moduleLink: 'journal',
    progress: progress({ currentStreakDays: 31, longestStreakDays: 31, shields: 2, adherence30d: 0.97, xpEarned: 1180 }),
  },
];

const INACTIVE_SEEDS: QuestSeed[] = [
  {
    id: 'cold-shower',
    name: 'Cold shower',
    statAffinity: 'discipline',
    strictness: 'optional',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 5,
    active: false,
    notes: 'Paused. The 22-day streak stays in History as a closed record.',
    progress: progress({ currentStreakDays: 0, longestStreakDays: 22, xpEarned: 540 }),
  },
  {
    id: 'learn-norwegian',
    name: 'Learn Norwegian — 15 min',
    statAffinity: 'mind',
    strictness: 'routine',
    days: WEEKDAYS_PLUS_SAT,
    startTimeMinutes: 1140,
    durationMinutes: 15,
    active: false,
    notes: 'Archived in July. The 480 XP it earned is kept.',
    progress: progress({ currentStreakDays: 0, longestStreakDays: 16, xpEarned: 480 }),
  },
  {
    id: 'meal-prep',
    name: 'Meal-prep Sunday',
    statAffinity: 'body',
    strictness: 'routine',
    days: ['sun'],
    startTimeMinutes: 660,
    durationMinutes: 90,
    active: false,
    notes: 'Archived in June, replaced by the weekly budget review.',
    progress: progress({ currentStreakDays: 0, longestStreakDays: 11, xpEarned: 720 }),
  },
];

const RECOVERY_SEEDS: QuestSeed[] = [
  {
    id: 'morning-walk',
    name: 'Morning walk — 20 min',
    statAffinity: 'body',
    strictness: 'optional',
    days: EVERY_DAY,
    startTimeMinutes: 480,
    durationMinutes: 20,
    progress: progress({ currentStreakDays: 3, longestStreakDays: 12, adherence30d: 0.33, xpEarned: 180, recentOutcomes: outcomes(['missed', 'missed', 'completed']) }),
  },
  {
    id: 'read-pages',
    name: 'Read 10 pages',
    statAffinity: 'mind',
    strictness: 'optional',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 15,
    notes: 'Reduced from 20 pages for the comeback week.',
    consequences: [{ metric: 'pages', fullValue: 10, unit: 'pages', partialMode: 'scaled' }],
    progress: progress({ currentStreakDays: 3, longestStreakDays: 41, shields: 1, adherence30d: 0.29, xpEarned: 2480 }),
  },
  {
    id: 'drink-water',
    name: 'Drink 2 litres',
    statAffinity: 'body',
    strictness: 'goal',
    days: EVERY_DAY,
    startTimeMinutes: null,
    durationMinutes: 0,
    threshold: { metric: 'water', target: 2, unit: 'l' },
    progress: progress({ currentStreakDays: 2, longestStreakDays: 14, adherence30d: 0.4, xpEarned: 260 }),
  },
];

function toQuest(seed: QuestSeed, today: string): Quest {
  return {
    id: seed.id,
    name: seed.name,
    notes: seed.notes ?? null,
    startTimeMinutes: seed.startTimeMinutes,
    durationMinutes: seed.durationMinutes,
    statAffinity: seed.statAffinity,
    strictness: seed.strictness,
    optionalStreakOptIn: seed.strictness === 'optional',
    recurrence: recurrence(seed.days, shiftDate(today, -120)),
    consequences: seed.consequences ?? [],
    moduleLink: seed.moduleLink ?? null,
    notification: { enabled: seed.startTimeMinutes !== null, leadMinutes: 10 },
    healthThreshold: seed.threshold ?? null,
    preCommit: seed.preCommit ?? false,
    active: seed.active ?? true,
    createdAt: shiftDate(today, -120),
    updatedAt: shiftDate(today, -7),
  };
}

export interface SeedResult {
  quests: Quest[];
  progress: Record<string, QuestProgress>;
  hero: HeroState;
  activity: ActivityEntry[];
  metrics: Record<string, number>;
}

const HERO_BY_PERSONA: Record<Persona, HeroState> = {
  new: {
    level: 1,
    title: 'Unnamed hero',
    coins: 0,
    xp: 0,
    xpIntoLevel: 0,
    xpForNextLevel: 100,
    hp: 5,
    hpMax: 5,
    momentum: 'steady',
    crown: { label: 'this month', dayIndex: 1, dayCount: 30, keptPercent: 0 },
  },
  active: {
    level: 14,
    title: 'Keeper of Small Mornings',
    coins: 312,
    xp: 8420,
    xpIntoLevel: 420,
    xpForNextLevel: 1600,
    hp: 4,
    hpMax: 5,
    momentum: 'warm',
    crown: { label: 'this month', dayIndex: 23, dayCount: 31, keptPercent: 74 },
  },
  recovery: {
    level: 14,
    title: 'Keeper of Small Mornings',
    coins: 286,
    xp: 7940,
    xpIntoLevel: 140,
    xpForNextLevel: 1600,
    hp: 2,
    hpMax: 5,
    momentum: 'cold',
    crown: { label: 'this month', dayIndex: 23, dayCount: 31, keptPercent: 41 },
  },
};

const ACTIVITY_BY_PERSONA: Record<Persona, ActivityEntry[]> = {
  new: [],
  active: [
    { id: 'a1', text: 'Morning run completed · +12 XP', when: '07:40', rewarded: true },
    { id: 'a2', text: 'Groceries €18.40 · Food', when: '09:12', rewarded: false },
    { id: 'a3', text: 'Weight 78.4 kg · down 0.3', when: '07:05', rewarded: false },
    { id: 'a4', text: 'Side quest: fixed the bike light · +5 XP', when: 'yesterday', rewarded: true },
    { id: 'a5', text: 'Evening stretch missed · streak closed at 9 days', when: 'yesterday', rewarded: false },
  ],
  recovery: [
    { id: 'a1', text: 'Morning walk completed · +5 XP', when: '08:20', rewarded: true },
    { id: 'a2', text: 'Shield held on Read 10 pages', when: 'yesterday', rewarded: false },
    { id: 'a3', text: 'Returning after eight days away', when: '3 days ago', rewarded: false },
  ],
};

export const QUICK_LOG_TILES: QuickLogTile[] = [
  { id: 'expense', label: 'Expense', value: '€18.40 today', to: '/finance' },
  { id: 'meal', label: 'Meal', value: '1,860 kcal', to: '/log' },
  { id: 'steps', label: 'Steps', value: '6,240', to: '/log' },
  { id: 'water', label: 'Water', value: '1.4 l', to: '/log' },
  { id: 'weight', label: 'Weight', value: '78.4 kg', to: '/log' },
  { id: 'journal', label: 'Journal', value: 'not yet', to: '/log' },
];

export function seed(today: string, persona: Persona): SeedResult {
  const seeds = persona === 'new' ? [] : persona === 'recovery' ? RECOVERY_SEEDS : [...ACTIVE_SEEDS, ...INACTIVE_SEEDS];
  const quests = seeds.map(item => toQuest(item, today));
  const questProgress: Record<string, QuestProgress> = {};
  for (const item of seeds) questProgress[item.id] = item.progress;

  return {
    quests,
    progress: questProgress,
    hero: { ...HERO_BY_PERSONA[persona], crown: { ...HERO_BY_PERSONA[persona].crown } },
    activity: [...ACTIVITY_BY_PERSONA[persona]],
    metrics: { steps: 6240, water: 1.4, sleep: 7.5, calories: 480 },
  };
}
