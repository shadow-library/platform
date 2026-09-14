import {
  ACHIEVEMENTS,
  type ActivityEntry,
  adherenceOf,
  BUILT_IN_CATEGORIES,
  CARRIED_STATES,
  type CosmeticKind,
  COSMETICS,
  type CrownCadence,
  type CrownPeriod,
  type CurrencyCode,
  type DayMode,
  type ExpenseAuditAction,
  type ExpenseAuditChange,
  type ExpenseAuditEntry,
  type ExpenseAuditField,
  type ExpenseCategory,
  type ExpenseCategoryId,
  type ExpenseDetail,
  type FinanceSettings,
  HEALTH_METRIC_NAMES,
  type HealthComparison,
  type HealthMetricEntry,
  type HealthMetricKey,
  type HeroState,
  isCurrencyCode,
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
  type QuestLogState,
  type QuestProgress,
  REASON_TAGS,
  type ReasonTag,
  type Recurrence,
  type ReflectGrant,
  type ReflectQuestLog,
  type ReflectSource,
  type ReminderLead,
  reschedulesCountedFor,
  shiftDate,
  type SideQuest,
  type StatAffinity,
  type Strictness,
  type Subscription,
  type SubscriptionCategoryId,
  type SubscriptionFrequency,
  type ThresholdOffer,
  TITLES,
  UNCATEGORISED,
  type Weekday,
  type WeightEntry,
} from '@/lib/data';
import { formatLocalTime } from '@/lib/format';

import { type DeltaRow, type SyncDomain } from './sync.types';

export type DomainRows = Record<SyncDomain, DeltaRow[]>;

const MOMENTUM_STATES: Momentum[] = ['cold', 'steady', 'warm'];

function toMomentum(value: string | null): Momentum {
  return MOMENTUM_STATES.find(state => state === value) ?? 'steady';
}

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

const CROWN_CADENCES: CrownCadence[] = ['daily', 'weekly'];

function dayOneCrown(today: string): CrownPeriod {
  return { label: 'today', cadence: 'daily', periodStart: today, closesOn: today, dayIndex: 1, dayCount: 1, keptPercent: 100 };
}

function toCrown(raw: unknown, today: string): CrownPeriod {
  const fallback = dayOneCrown(today);
  if (typeof raw !== 'object' || raw === null) return fallback;
  const crown = raw as DeltaRow;
  return {
    label: text(crown, 'label') ?? fallback.label,
    cadence: CROWN_CADENCES.find(cadence => cadence === text(crown, 'cadence')) ?? fallback.cadence,
    periodStart: text(crown, 'periodStart') ?? fallback.periodStart,
    closesOn: text(crown, 'closesOn') ?? fallback.closesOn,
    dayIndex: number(crown, 'dayIndex', fallback.dayIndex),
    dayCount: number(crown, 'dayCount', fallback.dayCount),
    keptPercent: number(crown, 'keptPercent', fallback.keptPercent),
  };
}

export type HeroPersona = Extract<DayMode, 'active' | 'returner' | 'recovery'>;

const HERO_PERSONAS: HeroPersona[] = ['active', 'returner', 'recovery'];

function toHeroPersona(value: string | null): HeroPersona {
  return HERO_PERSONAS.find(persona => persona === value) ?? 'active';
}

function toHeroState(account: DeltaRow | undefined, today: string): HeroState {
  if (!account) return { level: 1, title: '', coins: 0, xp: 0, xpIntoLevel: 0, xpForNextLevel: null, hp: 0, hpMax: 3, momentum: 'steady', crown: dayOneCrown(today) };
  return {
    level: number(account, 'level', 1),
    title: TITLES.find(title => title.id === text(account, 'displayedTitleId'))?.name ?? '',
    coins: number(account, 'coins'),
    xp: number(account, 'totalXp'),
    xpIntoLevel: number(account, 'xpIntoLevel'),
    xpForNextLevel: numberOrNull(account, 'xpForNextLevel'),
    hp: number(account, 'hpToday'),
    hpMax: number(account, 'hpMax', 3),
    momentum: toMomentum(text(account, 'warmthState')),
    crown: toCrown(account['crown'], today),
  };
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

const HEALTH_COMPARISONS: HealthComparison[] = ['gte', 'lte'];

function metricKeyResolver(metricIds: Partial<Record<HealthMetricKey, string>>): (metricId: string) => HealthMetricKey | null {
  return metricId => (Object.entries(metricIds).find(([, id]) => id === metricId)?.[0] as HealthMetricKey | undefined) ?? null;
}

/** Server wire shape is `{ metricId, value, comparison }` (opaque jsonb); anything unresolvable or malformed skips the threshold instead of crashing. */
function toHealthThreshold(raw: unknown, keyOf: (metricId: string) => HealthMetricKey | null): Quest['healthThreshold'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const { metricId, value, comparison } = raw as Record<string, unknown>;
  if (typeof metricId !== 'string' || typeof value !== 'number' || !HEALTH_COMPARISONS.includes(comparison as HealthComparison)) return null;
  const metricKey = keyOf(metricId);
  return metricKey ? { metricKey, value, comparison: comparison as HealthComparison } : null;
}

function toQuest(row: DeltaRow, keyOf: (metricId: string) => HealthMetricKey | null): Quest {
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
    healthThreshold: toHealthThreshold(row['healthThreshold'], keyOf),
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
    shielded: bool(row, 'shielded'),
    progress: null,
  };
}

const ADHERENCE_WINDOW_DAYS = 30;
const MIN_COUNTED_OCCURRENCES = 3;

function questLogState(row: DeltaRow): QuestLogState {
  return QUEST_LOG_STATES.find(candidate => candidate === text(row, 'state')) ?? 'completed';
}

function logDate(row: DeltaRow): string {
  return String(row['date']);
}

function activityTimestamp(row: DeltaRow): string {
  return text(row, 'performedAt') ?? text(row, 'updatedAt') ?? text(row, 'createdAt') ?? '';
}

function toProgress(row: DeltaRow | undefined, logs: DeltaRow[], rescheduledDates: string[], today: string, questNames: Map<string, string>): QuestProgress {
  const adherenceSince = shiftDate(today, -(ADHERENCE_WINDOW_DAYS - 1));
  const windowed = logs
    .filter(log => logDate(log) >= adherenceSince && logDate(log) <= today)
    .sort((a, b) => logDate(a).localeCompare(logDate(b)))
    .map(log => toReflectQuestLog(log, questNames));

  const adherence = adherenceOf(windowed);
  const xpEarned = logs.reduce((total, log) => total + number(log, 'xpAwarded'), 0);

  return {
    currentStreakDays: row ? number(row, 'currentRunDays') : 0,
    longestStreakDays: row ? number(row, 'bestRunDays') : 0,
    shields: row ? number(row, 'shieldsAvailable') : 0,
    adherence30d: adherence.occurrences >= MIN_COUNTED_OCCURRENCES ? adherence.ratio : null,
    xpEarned,
    reschedulesUsed: reschedulesCountedFor(rescheduledDates, today).length,
    rescheduleCap: 2,
    rescheduledDates,
    recentOutcomes: windowed.filter(log => !CARRIED_STATES.includes(log.state)).map(log => log.state),
  };
}

function toActivityEntry(row: DeltaRow, questName: string): ActivityEntry {
  const xpAwarded = number(row, 'xpAwarded');
  return {
    id: String(row['id']),
    text: `${questName} ${questLogState(row)}${xpAwarded > 0 ? ` · +${xpAwarded} XP` : ''}`,
    when: formatLocalTime(activityTimestamp(row)) || 'today',
    rewarded: xpAwarded > 0,
  };
}

/** A health threshold is judged against the value the owner registered for the day, so a `quest_log`-sourced entry never counts. */
function metricValuesOn(rows: DeltaRow[], keyOf: (metricId: string) => HealthMetricKey | null, date: string): Record<string, number> {
  const latest = new Map<HealthMetricKey, DeltaRow>();
  for (const row of rows) {
    const key = keyOf(String(row['metricId']));
    if (!key || String(row['date']) !== date || text(row, 'source') === 'quest_log') continue;
    const current = latest.get(key);
    if (!current || (text(row, 'createdAt') ?? '') >= (text(current, 'createdAt') ?? '')) latest.set(key, row);
  }
  return Object.fromEntries([...latest].map(([key, row]) => [key, number(row, 'value')]));
}

/**
 * Rebuilds the engine's world from the rows the delta pull has left in IndexedDB. It is deliberately total:
 * a domain the server has not yet populated projects to an empty set rather than to a hole, so each domain
 * flips from fixture-backed to live on its own without the projection learning about the others.
 */
export function projectWorldState(rows: Partial<DomainRows>, today: string): MemoirWorldState {
  const keyOf = metricKeyResolver(healthMetricIds(rows.metrics ?? []));
  const quests = (rows.quests ?? []).map(row => toQuest(row, keyOf));
  const account = rows.account?.[0];
  const questNames = new Map(quests.map(quest => [quest.id, quest.name]));

  const questLogRows = rows.quest_logs ?? [];
  const logsByQuest = new Map<string, DeltaRow[]>();
  for (const row of questLogRows) {
    const questId = String(row['questId']);
    const existing = logsByQuest.get(questId);
    if (existing) existing.push(row);
    else logsByQuest.set(questId, [row]);
  }

  const rescheduledDatesByQuest = new Map<string, string[]>();
  for (const row of rows.reschedule_events ?? []) {
    const questId = String(row['questId']);
    rescheduledDatesByQuest.set(questId, [...(rescheduledDatesByQuest.get(questId) ?? []), String(row['date'])]);
  }

  const streaksByQuest = new Map<string, DeltaRow>();
  for (const row of rows.quest_streaks ?? []) streaksByQuest.set(String(row['questId']), row);

  const progress: Record<string, QuestProgress> = {};
  for (const quest of quests)
    progress[quest.id] = toProgress(streaksByQuest.get(quest.id), logsByQuest.get(quest.id) ?? [], rescheduledDatesByQuest.get(quest.id) ?? [], today, questNames);

  const logs = new Map<string, LogRecord>();
  for (const row of questLogRows) logs.set(`${String(row['questId'])}:${logDate(row)}`, toLogRecord(row));

  const activity = questLogRows
    .filter(row => logDate(row) === today && text(row, 'state') !== 'missed')
    .sort((a, b) => activityTimestamp(b).localeCompare(activityTimestamp(a)))
    .slice(0, 8)
    .map(row => toActivityEntry(row, questNames.get(String(row['questId'])) ?? 'Quest'));

  const locks = new Set<string>();
  const lockedQuestIdsByDate = new Map<string, Set<string>>();
  for (const row of rows.daily_states ?? []) {
    if (row['committedAt'] === null || row['committedAt'] === undefined) continue;
    const date = String(row['date']);
    locks.add(date);
    lockedQuestIdsByDate.set(date, new Set(((row['lockedQuestIds'] as unknown[] | undefined) ?? []).map(String)));
  }

  return {
    today,
    persona: toHeroPersona(account ? text(account, 'persona') : null),
    quests,
    progress,
    logs,
    hero: toHeroState(account, today),
    activity,
    scheduleEndMinutes: account ? number(account, 'scheduleEndMin', 1380) : null,
    metrics: metricValuesOn(rows.metric_entries ?? [], keyOf, today),
    locks,
    lockedQuestIdsByDate,
  };
}

export interface FinanceRows {
  settings: FinanceSettings;
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

const AUDIT_ACTIONS: ExpenseAuditAction[] = ['created', 'updated', 'deleted', 'receipt_confirmed'];

const AUDIT_FIELDS: ExpenseAuditField[] = ['amountMinor', 'currency', 'occurredOn', 'categoryId', 'note', 'merchant'];

function toAuditChange(raw: unknown): ExpenseAuditChange | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const change = raw as DeltaRow;
  const field = AUDIT_FIELDS.find(candidate => candidate === text(change, 'field'));
  if (!field) return null;
  return { field, from: text(change, 'from'), to: text(change, 'to') };
}

function toAuditEntry(row: DeltaRow): ExpenseAuditEntry | null {
  const action = AUDIT_ACTIONS.find(candidate => candidate === text(row, 'action'));
  if (!action || action === 'deleted') return null;
  const changes = Array.isArray(row['changes']) ? row['changes'].map(toAuditChange).filter((change): change is ExpenseAuditChange => change !== null) : [];
  return { id: String(row['id']), action, changes, at: text(row, 'createdAt') ?? '' };
}

function auditsByExpense(rows: DeltaRow[]): Map<string, ExpenseAuditEntry[]> {
  const grouped = new Map<string, ExpenseAuditEntry[]>();
  for (const row of rows) {
    const entry = toAuditEntry(row);
    if (!entry) continue;
    const expenseId = String(row['expenseId']);
    grouped.set(expenseId, [...(grouped.get(expenseId) ?? []), entry]);
  }
  return grouped;
}

function toExpense(row: DeltaRow, audits: Map<string, ExpenseAuditEntry[]>): ExpenseDetail {
  const amountMinor = number(row, 'amountMinor');
  const id = String(row['id']);
  return {
    id,
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
    linkedQuestId: row['linkedQuestId'] === null || row['linkedQuestId'] === undefined ? undefined : String(row['linkedQuestId']),
    hasLineItems: Array.isArray(row['lineItems']) && row['lineItems'].length > 0,
    receiptRef: nullableText(row, 'receiptRef'),
    audit: audits.get(id) ?? [],
  };
}

const FALLBACK_HOME_CURRENCY: CurrencyCode = 'EUR';

/** The account row is absent only before the first pull lands, and readiness keeps every Money screen on its skeleton until then. */
function toFinanceSettings(account: DeltaRow | undefined): FinanceSettings {
  const home = account ? text(account, 'defaultCurrency') : null;
  const homeCurrency = home && isCurrencyCode(home) ? home : FALLBACK_HOME_CURRENCY;
  const enabled = account && Array.isArray(account['enabledCurrencies']) ? account['enabledCurrencies'] : [];
  const currencies = enabled.filter((code): code is CurrencyCode => typeof code === 'string' && isCurrencyCode(code) && code !== homeCurrency);
  return {
    homeCurrency,
    currencies: [homeCurrency, ...new Set(currencies)],
    weekStartsOn: account && number(account, 'weekStart', 1) === 0 ? 0 : 1,
    monthlyBudgetMinor: account ? numberOrNull(account, 'monthlyBudgetMinor') : null,
  };
}

/** `archivedAt` is authoritative; `active` is a legacy mirror. */
function toExpenseCategory(row: DeltaRow): ExpenseCategory {
  const key = (text(row, 'key') ?? 'uncat') as ExpenseCategoryId;
  const builtin = BUILT_IN_CATEGORIES.find(category => category.id === key) ?? UNCATEGORISED;
  return { ...builtin, id: key, name: text(row, 'label') ?? builtin.name, archived: nullableText(row, 'archivedAt') !== undefined };
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
  const audits = auditsByExpense(rows.expense_audits ?? []);
  return {
    settings: toFinanceSettings(rows.account?.[0]),
    expenses: (rows.expenses ?? []).map(row => toExpense(row, audits)),
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
  const keyOf = metricKeyResolver(metricIds);

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

function toReflectGrants(rows: Partial<DomainRows>): ReflectGrant[] {
  const named = (kind: ReflectGrant['kind'], id: string): string =>
    (kind === 'achievement' ? ACHIEVEMENTS : kind === 'title' ? TITLES : COSMETICS).find(entry => entry.id === id)?.name ?? id;

  return [
    ...(rows.achievements_earned ?? []).map(row => ({ id: String(row['achievementId']), kind: 'achievement' as const, earnedAt: text(row, 'earnedAt') ?? '' })),
    ...(rows.titles_earned ?? []).map(row => ({ id: String(row['titleId']), kind: 'title' as const, earnedAt: text(row, 'earnedAt') ?? '' })),
    ...(rows.cosmetic_unlocks ?? []).map(row => ({ id: String(row['cosmeticId']), kind: 'cosmetic' as const, earnedAt: text(row, 'unlockedAt') ?? text(row, 'createdAt') ?? '' })),
  ]
    .filter(grant => grant.earnedAt.length > 0)
    .map(grant => ({ ...grant, name: named(grant.kind, grant.id) }));
}

const QUEST_LOG_STATES: QuestLogState[] = ['completed', 'partial', 'skipped', 'missed', 'late', 'postponed', 'rescheduled', 'recovery'];

function toReflectQuestLog(row: DeltaRow, questNames: Map<string, string>): ReflectQuestLog {
  const questId = String(row['questId']);
  return {
    id: String(row['id']),
    questId,
    questName: questNames.get(questId) ?? 'Quest',
    date: String(row['date']),
    state: questLogState(row),
    xpAwarded: number(row, 'xpAwarded'),
    coinsAwarded: number(row, 'coinsAwarded'),
    reasonTag: (REASON_TAGS.find(candidate => candidate === text(row, 'reasonTag')) ?? null) as ReasonTag | null,
    statAffinity: (text(row, 'statAffinity') ?? 'discipline') as StatAffinity,
    performedAt: text(row, 'performedAt') ?? text(row, 'createdAt'),
  };
}

/**
 * The reflection world, assembled from the same mirrored rows every other screen reads. Nothing here calls
 * the server: History, Insights and the Weekly Review are derivations over what the delta pull already left
 * in IndexedDB, because the server exposes no read model for any of the three.
 */
export function projectReflectSource(rows: Partial<DomainRows>, today: string, queuedIds: string[] = []): ReflectSource {
  const account = rows.account?.[0];
  const questNames = new Map((rows.quests ?? []).map(row => [String(row['id']), text(row, 'name') ?? 'Quest']));
  const finance = projectFinanceRows(rows);
  const quickLogs = projectQuickLogRows(rows);

  return {
    today,
    homeCurrency: (account ? (text(account, 'defaultCurrency') as CurrencyCode | null) : null) ?? 'EUR',
    hero: {
      level: account ? number(account, 'level', 1) : 1,
      xp: account ? number(account, 'totalXp') : 0,
      coins: account ? number(account, 'coins') : 0,
      hp: account ? number(account, 'hpToday') : 0,
      hpMax: account ? number(account, 'hpMax', 3) : 3,
    },
    logs: (rows.quest_logs ?? []).map(row => toReflectQuestLog(row, questNames)),
    streaks: (rows.quest_streaks ?? []).map(row => ({
      questId: String(row['questId']),
      questName: questNames.get(String(row['questId'])) ?? 'Quest',
      currentRunDays: number(row, 'currentRunDays'),
      bestRunDays: number(row, 'bestRunDays'),
    })),
    expenses: finance.expenses,
    categories: finance.categories,
    subscriptions: finance.subscriptions,
    journal: quickLogs.journal,
    meals: quickLogs.meals,
    weights: quickLogs.weights,
    sideQuests: quickLogs.sideQuests,
    metricEntries: quickLogs.metricEntries,
    grants: toReflectGrants(rows),
    queuedIds,
  };
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

export interface ComebackStanding {
  armed: boolean;
  firedOn: string | null;
}

const HERO_EVENT_TYPES = [
  'quest_complete',
  'quest_partial',
  'quest_late',
  'recovery',
  'level_up',
  'achievement_unlock',
  'coin_grant',
  'crown_banked',
  'side_quest',
  'journal',
  'meal',
  'weight',
  'coin_spend',
  'recovery_spawned',
  'recovery_completed',
  'recovery_expired',
  'crown_init',
  'crown_forfeit',
  'returner_fired',
] as const;

export type HeroEventType = (typeof HERO_EVENT_TYPES)[number];

export interface HeroEventRecord {
  id: string;
  type: HeroEventType;
  questName: string | null;
  achievementId: string | null;
  xpDelta: number;
  coinsDelta: number;
  statAffinity: StatAffinity | null;
  statDelta: number;
  levelAfter: number | null;
  date: string;
  createdAt: string;
}

export interface ClosedCrown {
  periodStart: string;
  closedOn: string;
  banked: boolean;
}

export interface RecentMiss {
  questId: string;
  questName: string;
  /** Oldest first. */
  misses: { date: string; shielded: boolean }[];
}

export interface HeroStanding {
  persona: HeroPersona;
  comeback: ComebackStanding | null;
  shieldsAvailable: number;
  shieldCap: number;
  timezone: string | null;
  stats: Record<StatAffinity, number>;
  activeDays: number | null;
}

const STAT_AFFINITIES: StatAffinity[] = ['body', 'mind', 'wealth', 'discipline'];
const RECENT_MISS_WINDOW_DAYS = 7;

function toComeback(raw: unknown): ComebackStanding | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const comeback = raw as DeltaRow;
  return { armed: bool(comeback, 'armed'), firedOn: text(comeback, 'firedOn') };
}

function toHeroEvent(row: DeltaRow, questNames: Map<string, string>): HeroEventRecord | null {
  const type = HERO_EVENT_TYPES.find(candidate => candidate === text(row, 'type'));
  if (!type) return null;
  const questId = row['questId'] === null || row['questId'] === undefined ? null : String(row['questId']);
  return {
    id: String(row['id']),
    type,
    questName: questId === null ? null : (questNames.get(questId) ?? null),
    achievementId: text(row, 'achievementId'),
    xpDelta: number(row, 'xpDelta'),
    coinsDelta: number(row, 'coinsDelta'),
    statAffinity: STAT_AFFINITIES.find(stat => stat === text(row, 'statAffinity')) ?? null,
    statDelta: number(row, 'statDelta'),
    levelAfter: numberOrNull(row, 'levelAfter'),
    date: String(row['date']),
    createdAt: text(row, 'createdAt') ?? '',
  };
}

/** `hero_events` rows migrated before P1-17 received their `syncSeq` in physical order, so the cursor order is not the order they happened in. */
function newestFirst(left: HeroEventRecord, right: HeroEventRecord): number {
  return right.createdAt.localeCompare(left.createdAt) || Number(right.id) - Number(left.id);
}

function toClosedCrown(row: DeltaRow): ClosedCrown | null {
  const bankedXp = numberOrNull(row, 'crownBankedXp');
  if (bankedXp === null) return null;
  const closedOn = String(row['date']);
  return { periodStart: text(row, 'crownPeriodStart') ?? closedOn, closedOn, banked: bankedXp + number(row, 'crownBankedCoins') > 0 };
}

function questNamesOf(rows: Partial<DomainRows>): Map<string, string> {
  return new Map((rows.quests ?? []).map(row => [String(row['id']), text(row, 'name') ?? 'Quest']));
}

/** Newest first. */
export function projectHeroEvents(rows: Partial<DomainRows>): HeroEventRecord[] {
  const questNames = questNamesOf(rows);
  return (rows.hero_events ?? []).flatMap(row => toHeroEvent(row, questNames) ?? []).sort(newestFirst);
}

/** Oldest first. */
export function projectCrownHistory(rows: Partial<DomainRows>): ClosedCrown[] {
  return (rows.daily_states ?? []).flatMap(row => toClosedCrown(row) ?? []).sort((left, right) => left.closedOn.localeCompare(right.closedOn));
}

export function projectRecentMisses(rows: Partial<DomainRows>, today: string): RecentMiss[] {
  const questNames = questNamesOf(rows);
  const since = shiftDate(today, -RECENT_MISS_WINDOW_DAYS);
  const byQuest = new Map<string, RecentMiss['misses']>();
  for (const row of rows.quest_logs ?? []) {
    const date = logDate(row);
    if (text(row, 'state') !== 'missed' || date < since || date >= today) continue;
    const questId = String(row['questId']);
    const miss = { date, shielded: bool(row, 'shielded') };
    const misses = byQuest.get(questId);
    if (misses) misses.push(miss);
    else byQuest.set(questId, [miss]);
  }
  return [...byQuest].map(([questId, misses]) => ({
    questId,
    questName: questNames.get(questId) ?? 'Quest',
    misses: misses.sort((left, right) => left.date.localeCompare(right.date)),
  }));
}

export function projectHeroStanding(rows: Partial<DomainRows>): HeroStanding {
  const account = rows.account?.[0];
  const counters = rows.progress_counters?.[0];
  const stat = (field: string): number => (account ? number(account, field) : 0);

  return {
    persona: toHeroPersona(account ? text(account, 'persona') : null),
    comeback: account ? toComeback(account['comeback']) : null,
    shieldsAvailable: account ? number(account, 'shieldsAvailable') : 0,
    shieldCap: account ? number(account, 'shieldCap') : 0,
    timezone: account ? text(account, 'timezone') : null,
    stats: { body: stat('statBody'), mind: stat('statMind'), wealth: stat('statWealth'), discipline: stat('statDiscipline') },
    activeDays: counters ? numberOrNull(counters, 'activeDays') : null,
  };
}
