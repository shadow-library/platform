import { BUILT_IN_CATEGORIES, type ExpenseCategoryId, type ExpenseDetail, type Subscription } from './finance.types';
import { type Persona } from './fixtures';
import { shiftDate, weekdayOf } from './labels';
import { type QuestLogState, type ReasonTag, type StatAffinity, type Weekday } from './quest.types';
import { journalExcerpt, journalWordCount } from './quick-logs.rules';
import { type HealthMetricEntry, type HealthMetricKey, type JournalEntry, type Meal, type SideQuest, type WeightEntry } from './quick-logs.types';
import { emptyReflectSource, type ReflectGrant, type ReflectQuestLog, type ReflectSource, type ReflectStreak } from './reflect.derive';

const HISTORY_DAYS = 400;

/** A fixed-seed LCG, so every screenshot, story and screen test reads the same history. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

const EVERY_DAY: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SIX_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const C = 'completed' as const;
const P = 'partial' as const;
const M = 'missed' as const;
const S = 'skipped' as const;

interface QuestSeed {
  id: string;
  name: string;
  statAffinity: StatAffinity;
  days: Weekday[];
  xp: number;
  coins: number;
  bestRunDays: number;
  currentRunDays: number;
  pattern: QuestLogState[];
}

const QUEST_SEEDS: QuestSeed[] = [
  {
    id: 'journal-line',
    name: 'Journal a line',
    statAffinity: 'mind',
    xp: 20,
    coins: 0,
    bestRunDays: 31,
    currentRunDays: 31,
    days: EVERY_DAY,
    pattern: [...Array<QuestLogState>(29).fill(C), S],
  },
  {
    id: 'read-pages',
    name: 'Read 20 pages',
    statAffinity: 'mind',
    xp: 25,
    coins: 0,
    bestRunDays: 41,
    currentRunDays: 22,
    days: EVERY_DAY,
    pattern: [...Array<QuestLogState>(16).fill(C), M],
  },
  { id: 'morning-run', name: 'Morning run — 5 km', statAffinity: 'body', xp: 40, coins: 1, bestRunDays: 41, currentRunDays: 12, days: SIX_DAYS, pattern: [C, C, C, C, C, C, S] },
  { id: 'move-steps', name: 'Move 8,000 steps', statAffinity: 'body', xp: 30, coins: 0, bestRunDays: 22, currentRunDays: 5, days: EVERY_DAY, pattern: [C, C, C, C, C, P, M] },
  {
    id: 'strength-session',
    name: 'Strength session',
    statAffinity: 'body',
    xp: 60,
    coins: 2,
    bestRunDays: 19,
    currentRunDays: 7,
    days: ['tue', 'thu', 'sat'],
    pattern: [C, C, C, C, C, M, M],
  },
  {
    id: 'no-takeaway',
    name: 'No takeaway today',
    statAffinity: 'wealth',
    xp: 15,
    coins: 0,
    bestRunDays: 18,
    currentRunDays: 4,
    days: EVERY_DAY,
    pattern: [C, C, C, C, C, C, C, P, S, S, S],
  },
  {
    id: 'evening-stretch',
    name: 'Evening stretch',
    statAffinity: 'body',
    xp: 10,
    coins: 0,
    bestRunDays: 9,
    currentRunDays: 0,
    days: EVERY_DAY,
    pattern: [...Array<QuestLogState>(13).fill(C), ...Array<QuestLogState>(8).fill(M)],
  },
];

/** Weighted so `work_emergency` dominates the mix the Insights and Review screens name. */
const MISS_REASONS: ReasonTag[] = ['work_emergency', 'work_emergency', 'work_emergency', 'too_tired', 'travel', 'too_tired', 'health', 'forgot'];

const HELD_STATES: QuestLogState[] = ['completed', 'late', 'recovery', 'partial'];

function questLogs(today: string): ReflectQuestLog[] {
  const random = rng(20260824);
  const logs: ReflectQuestLog[] = [];
  const occurrence = new Map<string, number>();

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    const weekday = weekdayOf(date);

    for (const seed of QUEST_SEEDS) {
      if (!seed.days.includes(weekday)) continue;
      const index = occurrence.get(seed.id) ?? 0;
      occurrence.set(seed.id, index + 1);
      const state = seed.pattern[index % seed.pattern.length] as QuestLogState;
      const held = HELD_STATES.includes(state);
      const hour = seed.id === 'evening-stretch' ? 21 : seed.id === 'strength-session' ? 18 : seed.id === 'morning-run' ? 7 : 12 + Math.floor(random() * 8);
      logs.push({
        id: `${seed.id}:${date}`,
        questId: seed.id,
        questName: seed.name,
        date,
        state,
        xpAwarded: state === 'completed' ? seed.xp : state === 'partial' ? Math.round(seed.xp / 2) : 0,
        coinsAwarded: state === 'completed' ? seed.coins : 0,
        reasonTag: held && state !== 'partial' ? null : pick(MISS_REASONS, random),
        statAffinity: seed.statAffinity,
        performedAt: `${date}T${String(hour).padStart(2, '0')}:${String(Math.floor(random() * 60)).padStart(2, '0')}:00.000Z`,
      });
    }
  }

  return logs;
}

const STREAKS: ReflectStreak[] = QUEST_SEEDS.map(seed => ({ questId: seed.id, questName: seed.name, currentRunDays: seed.currentRunDays, bestRunDays: seed.bestRunDays }));

interface SpendSeed {
  categoryId: ExpenseCategoryId;
  merchants: string[];
  minMinor: number;
  maxMinor: number;
  weight: number;
}

const SPEND_SEEDS: SpendSeed[] = [
  { categoryId: 'food', merchants: ['Kaffebrenneriet', 'Bagerhuset', 'Nam Nam'], minMinor: 320, maxMinor: 2400, weight: 5 },
  { categoryId: 'groceries', merchants: ['Rema 1000', 'Kiwi', 'Meny'], minMinor: 840, maxMinor: 4200, weight: 4 },
  { categoryId: 'transport', merchants: ['Ruter', 'Circle K'], minMinor: 400, maxMinor: 3800, weight: 2 },
  { categoryId: 'health', merchants: ['Sats', 'Vitusapotek'], minMinor: 900, maxMinor: 4200, weight: 1 },
  { categoryId: 'shopping', merchants: ['Norli', 'Clas Ohlson'], minMinor: 1400, maxMinor: 5200, weight: 1 },
];

const SPEND_POOL: SpendSeed[] = SPEND_SEEDS.flatMap(seed => Array<SpendSeed>(seed.weight).fill(seed));

function expenses(today: string): ExpenseDetail[] {
  const random = rng(7761);
  const items: ExpenseDetail[] = [];

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    const count = random() < 0.18 ? 0 : random() < 0.62 ? 1 : 2;

    for (let index = 0; index < count; index += 1) {
      const seed = pick(SPEND_POOL, random);
      const amountMinor = seed.minMinor + Math.floor(random() * (seed.maxMinor - seed.minMinor));
      const scanned = random() < 0.08;
      items.push({
        id: `expense-${date}-${index}`,
        amountMinor,
        amountText: (amountMinor / 100).toFixed(2),
        currency: 'EUR',
        fxRate: null,
        homeAmountMinor: amountMinor,
        categoryId: seed.categoryId,
        merchant: pick(seed.merchants, random),
        occurredOnDate: date,
        loggedAt: `${date}T${String(8 + Math.floor(random() * 12)).padStart(2, '0')}:${String(Math.floor(random() * 60)).padStart(2, '0')}:00.000Z`,
        source: scanned ? 'ocr' : 'manual',
        syncState: 'synced',
        audit: [],
      });
    }

    if (date.endsWith('-01'))
      items.push({
        id: `expense-${date}-rent`,
        amountMinor: 78000,
        amountText: '780.00',
        currency: 'EUR',
        fxRate: null,
        homeAmountMinor: 78000,
        categoryId: 'home',
        merchant: 'Rent',
        occurredOnDate: date,
        loggedAt: `${date}T09:00:00.000Z`,
        source: 'manual',
        syncState: 'synced',
        audit: [],
      });
  }

  return items;
}

function subscriptions(today: string): Subscription[] {
  const lastWeek = shiftDate(today, -9);
  return [
    {
      id: 'sub-music',
      name: 'Spotify',
      amountMinor: 1099,
      amountText: '10.99',
      currency: 'EUR',
      frequency: 'monthly',
      billingDay: Number(lastWeek.slice(8, 10)),
      nextDueDate: shiftDate(lastWeek, 30),
      lastConfirmedDate: lastWeek,
      categoryId: 'music',
      reminderEnabled: true,
      reminderLead: '3-day',
      monthlyEquivalentMinor: 1099,
      active: true,
      createdAt: shiftDate(today, -300),
    },
    {
      id: 'sub-tools',
      name: 'Notion',
      amountMinor: 960,
      amountText: '9.60',
      currency: 'EUR',
      frequency: 'monthly',
      billingDay: 12,
      nextDueDate: shiftDate(today, 8),
      lastConfirmedDate: shiftDate(today, -22),
      categoryId: 'tools',
      reminderEnabled: false,
      reminderLead: 'on-day',
      monthlyEquivalentMinor: 960,
      active: true,
      createdAt: shiftDate(today, -260),
    },
  ];
}

const JOURNAL_LINES = [
  'Kept the morning even though the evening got away from me. Worth noticing which half of the day is actually mine.',
  'Skipped the stretch and knew I would while I was still at the desk. The intention was gone by four.',
  'A quiet one. Ran, read, cooked, and nothing needed deciding.',
  'The strength session moved again. Third week running, which is the real signal rather than any one Thursday.',
  'Ate out twice and it shows in the food column. Not a problem, just a choice I did not make deliberately.',
  'Good sleep for once, and everything downstream of it was easier. Nothing else changed.',
];

function journal(today: string): JournalEntry[] {
  const random = rng(31337);
  const entries: JournalEntry[] = [];

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    if (random() < 0.18) continue;
    const date = shiftDate(today, -offset);
    const text = pick(JOURNAL_LINES, random);
    entries.push({
      id: `journal-${date}`,
      date,
      title: journalExcerpt(text, 40) || 'Untitled',
      text,
      mood: (1 + Math.floor(random() * 5)) as JournalEntry['mood'],
      tags: [],
      wordCount: journalWordCount(text),
      loggedAt: `${date}T22:${String(Math.floor(random() * 60)).padStart(2, '0')}:00.000Z`,
      rewarded: true,
    });
  }

  return entries;
}

const MEAL_SEEDS: { name: string; calories: number; mealType: Meal['mealType'] }[] = [
  { name: 'Porridge and berries', calories: 380, mealType: 'cooked' },
  { name: 'Chicken salad and bread', calories: 620, mealType: 'cooked' },
  { name: 'Pasta with tomato', calories: 720, mealType: 'cooked' },
  { name: 'Ramen at Nam Nam', calories: 840, mealType: 'ate_out' },
  { name: 'Eggs on toast', calories: 440, mealType: 'cooked' },
];

function meals(today: string): Meal[] {
  const random = rng(9091);
  const items: Meal[] = [];

  for (let offset = 120; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      const seed = pick(MEAL_SEEDS, random);
      items.push({
        id: `meal-${date}-${index}`,
        date,
        name: seed.name,
        calories: seed.calories,
        mealType: seed.mealType,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        loggedAt: `${date}T${String(8 + index * 5).padStart(2, '0')}:30:00.000Z`,
        rewarded: index === 0,
        sourceLabel: 'Preset',
      });
    }
  }

  return items;
}

function weights(today: string): WeightEntry[] {
  const random = rng(4242);
  const entries: WeightEntry[] = [];

  for (let offset = 180; offset >= 0; offset -= 1) {
    if (random() < 0.25) continue;
    const date = shiftDate(today, -offset);
    entries.push({
      id: date,
      date,
      kg: Number((78.4 + (offset / 180) * 2.4 + (random() - 0.5) * 0.4).toFixed(1)),
      loggedAt: `${date}T07:0${Math.floor(random() * 9)}:00.000Z`,
      rewarded: true,
    });
  }

  return entries;
}

const METRIC_RANGES: Record<HealthMetricKey, { base: number; spread: number; precision: number }> = {
  steps: { base: 5200, spread: 5600, precision: 0 },
  calories: { base: 320, spread: 380, precision: 0 },
  sleep: { base: 6.2, spread: 2.1, precision: 1 },
  water: { base: 1.2, spread: 1.4, precision: 1 },
};

function metricEntries(today: string): HealthMetricEntry[] {
  const random = rng(5150);
  const entries: HealthMetricEntry[] = [];

  for (let offset = 120; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    for (const [key, range] of Object.entries(METRIC_RANGES) as [HealthMetricKey, (typeof METRIC_RANGES)[HealthMetricKey]][]) {
      if (key === 'water' && random() < 0.8) continue;
      entries.push({
        key,
        date,
        value: Number((range.base + random() * range.spread).toFixed(range.precision)),
        loggedAt: `${date}T${key === 'sleep' ? '07' : '19'}:${String(Math.floor(random() * 60)).padStart(2, '0')}:00.000Z`,
        replacedValue: null,
        source: 'manual',
      });
    }
  }

  return entries;
}

const SIDE_QUEST_NAMES = ['Fixed the bike light', 'Cleared the inbox', 'Called Mum', 'Sorted the loft box', 'Repotted the fig', 'Cancelled a subscription'];

function sideQuests(today: string): SideQuest[] {
  const random = rng(6060);
  const items: SideQuest[] = [];

  for (let offset = 180; offset >= 0; offset -= 1) {
    if (random() < 0.78) continue;
    const date = shiftDate(today, -offset);
    items.push({
      id: `side-${date}`,
      date,
      name: pick(SIDE_QUEST_NAMES, random),
      statAffinity: 'discipline',
      xpAwarded: 15,
      coinsAwarded: 1,
      statTicked: true,
      rewarded: true,
      loggedAt: `${date}T18:${String(Math.floor(random() * 60)).padStart(2, '0')}:00.000Z`,
      meta: date,
    });
  }

  return items;
}

const GRANT_SEEDS: { id: string; kind: ReflectGrant['kind']; name: string; dayOffset: number }[] = [
  { id: 'first-light', kind: 'achievement', name: 'First light', dayOffset: -318 },
  { id: 'thirty-days', kind: 'achievement', name: 'Thirty days held', dayOffset: -204 },
  { id: 'keeper-of-mornings', kind: 'title', name: 'Keeper of Small Mornings', dayOffset: -96 },
  { id: 'quiet-ledger', kind: 'achievement', name: 'A quiet ledger', dayOffset: -41 },
  { id: 'slate-accent', kind: 'cosmetic', name: 'Slate accent', dayOffset: -12 },
  { id: 'level-fourteen', kind: 'achievement', name: 'Level 14 reached', dayOffset: -2 },
];

function grants(today: string): ReflectGrant[] {
  return GRANT_SEEDS.map(seed => ({ id: seed.id, kind: seed.kind, name: seed.name, earnedAt: `${shiftDate(today, seed.dayOffset)}T20:15:00.000Z` }));
}

/** The reflection world the fixture provider derives from — the same shape the sync mirror projects, so neither side can drift from the other. */
export function reflectSeed(today: string, persona: Persona): ReflectSource {
  if (persona === 'new') return emptyReflectSource(today);

  const items = expenses(today);
  return {
    today,
    homeCurrency: 'EUR',
    hero: { level: 14, xp: 8420, coins: 312, hp: 4, hpMax: 5 },
    logs: questLogs(today),
    streaks: STREAKS,
    expenses: items,
    categories: [...BUILT_IN_CATEGORIES],
    subscriptions: subscriptions(today),
    journal: journal(today),
    meals: meals(today),
    weights: weights(today),
    sideQuests: sideQuests(today),
    metricEntries: metricEntries(today),
    grants: grants(today),
    queuedIds: [items.at(-1)?.id ?? ''],
  };
}
