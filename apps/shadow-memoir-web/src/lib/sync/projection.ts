import {
  BUILT_IN_CATEGORIES,
  type CosmeticKind,
  type CurrencyCode,
  type ExpenseCategory,
  type ExpenseCategoryId,
  type ExpenseDetail,
  HEALTH_METRIC_NAMES,
  type HealthMetricEntry,
  type HealthMetricKey,
  type JournalEntry,
  journalExcerpt,
  journalWordCount,
  type LogRecord,
  type Meal,
  type MealPreset,
  type MealType,
  type MemoirWorldState,
  type Momentum,
  type MoodValence,
  type Quest,
  type QuestProgress,
  type Recurrence,
  type ReminderLead,
  type SideQuest,
  type StatAffinity,
  type Strictness,
  type Subscription,
  type SubscriptionCategoryId,
  type SubscriptionFrequency,
  type ThresholdOffer,
  UNCATEGORISED,
  type Weekday,
  type WeightEntry,
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

export interface FinanceRows {
  expenses: ExpenseDetail[];
  subscriptions: Subscription[];
  categories: ExpenseCategory[];
}

export interface QuickLogRows {
  journal: JournalEntry[];
  meals: Meal[];
  presets: MealPreset[];
  weights: WeightEntry[];
  sideQuests: SideQuest[];
  metricEntries: HealthMetricEntry[];
  /** The account's catalogue id per built-in health metric, matched on `isHealth` + `name` — what `health.save` needs to become a `metric.register`. */
  metricIds: Partial<Record<HealthMetricKey, string>>;
  offers: ThresholdOffer[];
}

export interface HeroGrants {
  achievements: Record<string, string>;
  titles: Record<string, string>;
  ownedCosmetics: Set<string>;
  equippedCosmetics: Partial<Record<CosmeticKind, string>>;
  displayedTitleId: string | null;
}

function nullableText(row: DeltaRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberOrNull(row: DeltaRow, key: string): number | null {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function toExpense(row: DeltaRow): ExpenseDetail {
  const amountMinor = number(row, 'amountMinor');
  return {
    id: String(row['id']),
    amountMinor,
    amountText: text(row, 'amountText') ?? String(amountMinor / 100),
    currency: (text(row, 'currency') ?? 'EUR') as CurrencyCode,
    fxRate: numberOrNull(row, 'fxRate'),
    homeAmountMinor: numberOrNull(row, 'homeAmountMinor'),
    categoryId: (text(row, 'categoryId') ?? 'uncat') as ExpenseCategoryId,
    merchant: nullableText(row, 'merchant'),
    note: nullableText(row, 'note'),
    occurredOnDate: text(row, 'occurredOn') ?? '',
    loggedAt: text(row, 'loggedAt') ?? '',
    source: (text(row, 'source') ?? 'manual') as ExpenseDetail['source'],
    syncState: 'synced',
    linkedSubscriptionId: nullableText(row, 'linkedSubscriptionId'),
    audit: [],
  };
}

function toExpenseCategory(row: DeltaRow): ExpenseCategory {
  const key = (text(row, 'key') ?? 'uncat') as ExpenseCategoryId;
  const builtin = BUILT_IN_CATEGORIES.find(category => category.id === key) ?? UNCATEGORISED;
  return { ...builtin, id: key, name: text(row, 'label') ?? builtin.name, archived: !bool(row, 'active', true) };
}

const REMINDER_LEAD_LOCAL: Record<string, ReminderLead> = { on_day: 'on-day', '1_day': '1-day', '2_day': '2-day', '3_day': '3-day', '1_week': '1-week' };

/** The inverse of `command-wire.ts`'s `subscriptionCategoryWire`, and lossy by construction: three subscription groupings share the `subs` expense key, so the whole class projects back as `tools`. */
const SUBSCRIPTION_CATEGORY_LOCAL: Record<string, SubscriptionCategoryId> = { subs: 'tools', health: 'health', shopping: 'books' };

function toSubscription(row: DeltaRow): Subscription {
  const nextDueDate = text(row, 'nextDueDate') ?? '';
  return {
    id: String(row['id']),
    name: text(row, 'name') ?? 'Subscription',
    note: nullableText(row, 'note'),
    amountMinor: number(row, 'amountMinor'),
    amountText: text(row, 'amountText') ?? '',
    currency: (text(row, 'currency') ?? 'EUR') as CurrencyCode,
    frequency: (text(row, 'frequency') ?? 'monthly') as SubscriptionFrequency,
    customIntervalDays: numberOrNull(row, 'customIntervalDays') ?? undefined,
    billingDay: number(row, 'billingDay', Number(nextDueDate.slice(8, 10)) || 1),
    nextDueDate,
    lastConfirmedDate: text(row, 'lastConfirmedDate'),
    categoryId: SUBSCRIPTION_CATEGORY_LOCAL[text(row, 'categoryId') ?? ''] ?? 'tools',
    reminderEnabled: bool(row, 'reminderEnabled'),
    reminderLead: REMINDER_LEAD_LOCAL[text(row, 'reminderLead') ?? ''] ?? 'on-day',
    monthlyEquivalentMinor: number(row, 'monthlyEquivalentMinor'),
    active: bool(row, 'active', true),
    createdAt: text(row, 'createdAt') ?? '',
  };
}

export function projectFinanceRows(rows: Partial<DomainRows>): FinanceRows {
  const categories = (rows.expense_categories ?? []).map(toExpenseCategory);
  return {
    expenses: (rows.expenses ?? []).map(toExpense),
    subscriptions: (rows.subscriptions ?? []).map(toSubscription),
    categories: categories.length > 0 ? categories : [...BUILT_IN_CATEGORIES],
  };
}

function toJournalEntry(row: DeltaRow): JournalEntry {
  const body = text(row, 'text') ?? '';
  return {
    id: String(row['id']),
    date: String(row['date']),
    title: journalExcerpt(body, 40) || 'Untitled',
    text: body,
    mood: numberOrNull(row, 'mood') as MoodValence | null,
    tags: Array.isArray(row['tags']) ? (row['tags'] as string[]) : [],
    wordCount: journalWordCount(body),
    loggedAt: text(row, 'loggedAt') ?? '',
    rewarded: bool(row, 'rewarded'),
  };
}

/** The server keeps calories and no macros (ARCHITECTURE §10.3), so a projected meal carries zeroes rather than invented grams. */
function toMeal(row: DeltaRow): Meal {
  const presetId = nullableText(row, 'presetId');
  return {
    id: String(row['id']),
    date: String(row['date']),
    name: text(row, 'name') ?? 'Meal',
    calories: number(row, 'calories'),
    mealType: (text(row, 'mealType') ?? 'cooked') as MealType,
    note: nullableText(row, 'note'),
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    loggedAt: text(row, 'loggedAt') ?? '',
    rewarded: bool(row, 'rewarded'),
    ...(presetId ? { presetId } : {}),
    sourceLabel: presetId ? 'Preset' : 'Typed',
  };
}

function toMealPreset(row: DeltaRow): MealPreset {
  return {
    id: String(row['id']),
    name: text(row, 'name') ?? 'Preset',
    calories: number(row, 'calories'),
    mealType: (text(row, 'mealType') ?? 'cooked') as MealType,
    note: nullableText(row, 'note'),
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    usageCount: 0,
  };
}

function toWeightEntry(row: DeltaRow): WeightEntry {
  const date = String(row['date']);
  return { id: date, date, kg: number(row, 'kg'), loggedAt: text(row, 'loggedAt') ?? '', rewarded: bool(row, 'rewarded') };
}

function toSideQuest(row: DeltaRow): SideQuest {
  const date = String(row['date']);
  return {
    id: String(row['id']),
    date,
    name: text(row, 'name') ?? 'Side quest',
    statAffinity: (text(row, 'statAffinity') ?? 'discipline') as StatAffinity,
    xpAwarded: number(row, 'xpAwarded'),
    coinsAwarded: number(row, 'coinsAwarded'),
    statTicked: number(row, 'statTicked') > 0,
    rewarded: bool(row, 'rewarded'),
    loggedAt: text(row, 'loggedAt') ?? '',
    meta: date,
  };
}

function healthMetricIds(rows: DeltaRow[]): Partial<Record<HealthMetricKey, string>> {
  const ids: Partial<Record<HealthMetricKey, string>> = {};
  for (const row of rows) {
    if (!bool(row, 'isHealth')) continue;
    const name = text(row, 'name');
    for (const [key, metricName] of Object.entries(HEALTH_METRIC_NAMES)) if (metricName === name) ids[key as HealthMetricKey] = String(row['id']);
  }
  return ids;
}

function toThresholdOffer(row: DeltaRow, keyOf: (metricId: string) => HealthMetricKey | null): ThresholdOffer | null {
  const metricKey = keyOf(String(row['metricId']));
  if (!metricKey) return null;

  const thresholdValue = number(row, 'thresholdValue');
  const currentValue = number(row, 'currentValue');
  const questTitle = text(row, 'questName') ?? 'the quest';
  return {
    metricKey,
    questId: String(row['questId']),
    questTitle,
    thresholdValue,
    currentValue,
    ratio: thresholdValue > 0 ? Math.min(currentValue / thresholdValue, 1) : 1,
    met: true,
    xp: 0,
    note: `Threshold ${thresholdValue} reached — the quest is waiting for you.`,
  };
}

export function projectQuickLogRows(rows: Partial<DomainRows>): QuickLogRows {
  const metricIds = healthMetricIds(rows.metrics ?? []);
  const keyOf = (metricId: string): HealthMetricKey | null => (Object.entries(metricIds).find(([, id]) => id === metricId)?.[0] as HealthMetricKey | undefined) ?? null;

  return {
    journal: (rows.journal_entries ?? []).map(toJournalEntry),
    meals: (rows.meals ?? []).map(toMeal),
    presets: (rows.meal_presets ?? []).map(toMealPreset),
    weights: (rows.weights ?? []).map(toWeightEntry),
    sideQuests: (rows.side_quests ?? []).map(toSideQuest),
    metricEntries: (rows.metric_entries ?? []).flatMap(row => {
      const key = keyOf(String(row['metricId']));
      if (!key) return [];
      const entry: HealthMetricEntry = {
        key,
        date: String(row['date']),
        value: number(row, 'value'),
        loggedAt: text(row, 'createdAt') ?? '',
        replacedValue: null,
        source: 'manual',
      };
      return [entry];
    }),
    metricIds,
    offers: (rows.health_offers ?? []).flatMap(row => {
      const offer = toThresholdOffer(row, keyOf);
      return offer ? [offer] : [];
    }),
  };
}

export interface AiTaskRow {
  id: string;
  queryText: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled' | 'held_upgrade';
  kind: 'adhoc' | 'scheduled';
  submittedAt: string;
  expectedBy: string;
  /** The `YYYY-MM` the row was charged against, or null when it consumed no ad-hoc quota. */
  quotaMonth: string | null;
  quotaConsumed: boolean;
  error: string | null;
}

export interface AiResultRow {
  id: string;
  taskId: string;
  answer: string;
  patterns: string[];
  suggestions: { kind: string; questId: string; text: string }[];
  limitationNote: string | null;
  createdAt: string;
}

export interface AiRows {
  tasks: AiTaskRow[];
  results: AiResultRow[];
  /** Granted classes only — a withdrawn row is present with `withdrawnAt` set, which is what makes "decided" different from "granted". */
  grantedClasses: Set<string>;
  decidedClasses: Set<string>;
  scheduledQuery: { queryText: string; active: boolean } | null;
}

export interface EntitlementRow {
  tier: 'free' | 'paid';
  state: string;
  expiresAt: string | null;
  trialUsed: boolean;
}

const AI_TASK_STATUSES: AiTaskRow['status'][] = ['pending', 'running', 'done', 'failed', 'cancelled', 'held_upgrade'];

function toAiTask(row: DeltaRow): AiTaskRow {
  const status = AI_TASK_STATUSES.find(candidate => candidate === text(row, 'status')) ?? 'pending';
  return {
    id: String(row['id']),
    queryText: text(row, 'queryText') ?? '',
    status,
    kind: text(row, 'kind') === 'scheduled' ? 'scheduled' : 'adhoc',
    submittedAt: text(row, 'submittedAt') ?? '',
    expectedBy: text(row, 'expectedBy') ?? '',
    quotaMonth: text(row, 'quotaMonth'),
    quotaConsumed: bool(row, 'quotaConsumed'),
    error: text(row, 'error'),
  };
}

function toAiResult(row: DeltaRow): AiResultRow {
  const suggestions = Array.isArray(row['suggestions']) ? (row['suggestions'] as Record<string, unknown>[]) : [];
  return {
    id: String(row['id']),
    taskId: String(row['taskId']),
    answer: text(row, 'answer') ?? '',
    patterns: Array.isArray(row['patterns']) ? (row['patterns'] as unknown[]).map(String) : [],
    suggestions: suggestions.map(suggestion => ({
      kind: String(suggestion['kind'] ?? ''),
      questId: String(suggestion['questId'] ?? ''),
      text: String(suggestion['text'] ?? ''),
    })),
    limitationNote: text(row, 'limitationNote'),
    createdAt: text(row, 'createdAt') ?? '',
  };
}

export function projectAiRows(rows: Partial<DomainRows>): AiRows {
  const grantedClasses = new Set<string>();
  const decidedClasses = new Set<string>();
  for (const row of rows.ai_consents ?? []) {
    const dataClass = text(row, 'dataClass');
    if (!dataClass) continue;
    decidedClasses.add(dataClass);
    if (row['withdrawnAt'] === null || row['withdrawnAt'] === undefined) grantedClasses.add(dataClass);
  }

  const scheduled = rows.ai_scheduled_queries?.[0];
  return {
    tasks: (rows.ai_tasks ?? []).map(toAiTask).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    results: (rows.ai_results ?? []).map(toAiResult).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    grantedClasses,
    decidedClasses,
    scheduledQuery: scheduled ? { queryText: text(scheduled, 'queryText') ?? '', active: bool(scheduled, 'active', true) } : null,
  };
}

export function projectEntitlement(rows: Partial<DomainRows>): EntitlementRow {
  const row = rows.entitlement?.[0];
  if (!row) return { tier: 'free', state: 'free', expiresAt: null, trialUsed: false };
  return { tier: text(row, 'tier') === 'paid' ? 'paid' : 'free', state: text(row, 'state') ?? 'free', expiresAt: text(row, 'expiresAt'), trialUsed: bool(row, 'trialUsed') };
}

/** Counts per delta domain, for the export and deletion screens' "what this covers" list — the only honest source, since neither endpoint enumerates them. */
export function projectRecordCounts(rows: Partial<DomainRows>): { name: string; meta: string }[] {
  const count = (domain: SyncDomain): number => (rows[domain] ?? []).length;
  const plural = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`;

  return [
    { name: 'Quests and history', meta: `${plural(count('quests'), 'quest')} · ${plural(count('quest_logs'), 'outcome')}` },
    { name: 'Hero and progression', meta: `${plural(count('achievements_earned'), 'achievement')} · ${plural(count('titles_earned'), 'title')}` },
    { name: 'Money', meta: `${plural(count('expenses'), 'expense')} · ${plural(count('subscriptions'), 'subscription')}` },
    { name: 'Journal', meta: `${count('journal_entries')} ${count('journal_entries') === 1 ? 'entry' : 'entries'}` },
    { name: 'Body and health', meta: `${plural(count('weights'), 'weight')} · ${plural(count('meals'), 'meal')} · ${plural(count('metric_entries'), 'metric')}` },
    { name: 'Coaching results', meta: `${plural(count('ai_results'), 'result')} · ${plural(count('ai_tasks'), 'request')}` },
  ];
}

export function projectHeroGrants(rows: Partial<DomainRows>): HeroGrants {
  const achievements: Record<string, string> = {};
  for (const row of rows.achievements_earned ?? []) achievements[String(row['achievementId'])] = text(row, 'earnedAt') ?? '';

  const titles: Record<string, string> = {};
  for (const row of rows.titles_earned ?? []) titles[String(row['titleId'])] = text(row, 'earnedAt') ?? '';

  const ownedCosmetics = new Set<string>();
  const equippedCosmetics: Partial<Record<CosmeticKind, string>> = {};
  for (const row of rows.cosmetic_unlocks ?? []) {
    const cosmeticId = String(row['cosmeticId']);
    ownedCosmetics.add(cosmeticId);
    if (bool(row, 'equipped')) equippedCosmetics[text(row, 'kind') as CosmeticKind] = cosmeticId;
  }

  return { achievements, titles, ownedCosmetics, equippedCosmetics, displayedTitleId: rows.account?.[0] ? text(rows.account[0], 'displayedTitleId') : null };
}
