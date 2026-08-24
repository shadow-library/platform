import { DEFAULT_LOCALE } from '@shadow-library/ui';

import { categoryById, formatMinor, homeAmountOf } from './finance.rules';
import { BUILT_IN_CATEGORIES, type CurrencyCode, type ExpenseCategory, type ExpenseDetail, type Subscription } from './finance.types';
import { formatDayName, formatRange, REASON_LABELS, shiftDate, startOfWeek, STATE_LABELS, toDate, WEEKDAY_LABELS, weekdayOf, WEEKDAYS } from './labels';
import { type QuestLogState, type ReasonTag, type StatAffinity, type Weekday } from './quest.types';
import { formatMetricValue, HEALTH_METRICS } from './quick-logs.rules';
import { type HealthMetricEntry, type HealthMetricKey, type JournalEntry, type Meal, type SideQuest, type WeightEntry } from './quick-logs.types';
import {
  type Bar,
  type HistoryDetail,
  type HistoryFilter,
  type HistoryGroup,
  type HistoryKind,
  type HistoryRow,
  type HistoryView,
  type InsightKpi,
  type InsightPeriod,
  type InsightsView,
  type ReviewFact,
  type ReviewPrompt,
  type ReviewQuestRow,
  type ReviewView,
  type TrendSeries,
} from './reflect.types';

export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = {
  quest: 'Quest',
  hero: 'Hero',
  expense: 'Expense',
  journal: 'Journal',
  meal: 'Meal',
  weight: 'Weight',
  health: 'Health',
  'side-quest': 'Side quest',
  recovery: 'Recovery',
};

export const HISTORY_KINDS: HistoryFilter[] = ['all', 'quest', 'hero', 'expense', 'journal', 'meal', 'weight', 'health', 'side-quest', 'recovery'];

export const HISTORY_PAGE_SIZE = 20;

export interface ReflectQuestLog {
  id: string;
  questId: string;
  questName: string;
  date: string;
  state: QuestLogState;
  xpAwarded: number;
  coinsAwarded: number;
  reasonTag: ReasonTag | null;
  statAffinity: StatAffinity;
  performedAt: string | null;
}

export interface ReflectStreak {
  questId: string;
  questName: string;
  currentRunDays: number;
  bestRunDays: number;
}

export interface ReflectGrant {
  id: string;
  kind: 'achievement' | 'title' | 'cosmetic';
  name: string;
  earnedAt: string;
}

export interface ReflectHero {
  level: number;
  xp: number;
  coins: number;
  hp: number;
  hpMax: number;
}

/** Everything the three reflection surfaces read, in one shape, so the fixture engine and the sync mirror can feed the same derivations. */
export interface ReflectSource {
  today: string;
  homeCurrency: CurrencyCode;
  hero: ReflectHero;
  logs: ReflectQuestLog[];
  streaks: ReflectStreak[];
  expenses: ExpenseDetail[];
  categories: ExpenseCategory[];
  subscriptions: Subscription[];
  journal: JournalEntry[];
  meals: Meal[];
  weights: WeightEntry[];
  sideQuests: SideQuest[];
  metricEntries: HealthMetricEntry[];
  grants: ReflectGrant[];
  /** Record ids whose write is still in the outbox — the only thing a derivation cannot read from the rows themselves. */
  queuedIds: string[];
}

export interface ReviewLocalState {
  answers: Record<string, string>;
  complete: boolean;
}

export const REVIEW_PROMPTS: { id: string; question: string; placeholder: string }[] = [
  { id: 'better', question: 'What went better than you expected?', placeholder: 'One sentence is enough' },
  { id: 'change', question: 'What will you change about next week?', placeholder: 'One sentence is enough' },
  { id: 'carry', question: 'Anything you want to stop carrying?', placeholder: 'Optional' },
];

export function emptyReflectSource(today: string, homeCurrency: CurrencyCode = 'EUR'): ReflectSource {
  return {
    today,
    homeCurrency,
    hero: { level: 1, xp: 0, coins: 0, hp: 0, hpMax: 0 },
    logs: [],
    streaks: [],
    expenses: [],
    categories: [...BUILT_IN_CATEGORIES],
    subscriptions: [],
    journal: [],
    meals: [],
    weights: [],
    sideQuests: [],
    metricEntries: [],
    grants: [],
    queuedIds: [],
  };
}

/** A partial holds the streak but only half the occurrence, which is what the Insights caption promises. */
const HOLD_WEIGHT: Record<QuestLogState, number> = {
  completed: 1,
  late: 1,
  recovery: 1,
  partial: 0.5,
  skipped: 0,
  missed: 0,
  postponed: 0,
  rescheduled: 0,
};

/** A moved occurrence resolves on the day it moved to; counting it where it was planned would charge the owner twice. */
const CARRIED_STATES: QuestLogState[] = ['postponed', 'rescheduled'];

const PERIOD_DAYS: Record<InsightPeriod, number> = { '30': 30, '90': 90, '365': 365 };

const PERIOD_NOTES: Record<InsightPeriod, string> = {
  '30': 'The last 30 days, against the 30 before them.',
  '90': 'The last 90 days, against the 90 before them.',
  '365': 'The last year, with nothing to compare it against but itself.',
};

const NOTHING_YET = 'Nothing logged in this period yet. It fills in on its own.';

function scheduled(logs: ReflectQuestLog[]): ReflectQuestLog[] {
  return logs.filter(log => !CARRIED_STATES.includes(log.state));
}

export function holdsOccurrence(state: QuestLogState): boolean {
  return HOLD_WEIGHT[state] > 0;
}

export function adherenceOf(logs: ReflectQuestLog[]): { held: number; occurrences: number; ratio: number | null } {
  const counted = scheduled(logs);
  const held = counted.reduce((total, log) => total + HOLD_WEIGHT[log.state], 0);
  return { held, occurrences: counted.length, ratio: counted.length === 0 ? null : held / counted.length };
}

function within<T>(items: T[], from: string, to: string, dateOf: (item: T) => string): T[] {
  return items.filter(item => dateOf(item) >= from && dateOf(item) <= to);
}

function timeOf(timestamp: string | null | undefined): string {
  return typeof timestamp === 'string' && timestamp.length >= 16 ? timestamp.slice(11, 16) : '';
}

function percent(ratio: number): number {
  return Math.round(ratio * 100);
}

function metricDefinition(key: HealthMetricKey): (typeof HEALTH_METRICS)[number] {
  return HEALTH_METRICS.find(definition => definition.key === key) ?? (HEALTH_METRICS[0] as (typeof HEALTH_METRICS)[number]);
}

function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) as string}`;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function movement(delta: number): string {
  return delta === 0 ? 'level' : delta < 0 ? `down ${Math.abs(delta)}` : `up ${delta}`;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function rank<T>(counts: Map<string, T & { value: number }>): (T & { value: number })[] {
  return [...counts.values()].sort((left, right) => right.value - left.value);
}

export interface HistoryRecord extends HistoryRow {
  date: string;
  title: string;
  section: string;
  to: string;
  fields: { label: string; value: string }[];
  /** Only fields safe to match a typed query against — journal text, reason notes and expense notes are deliberately absent. */
  haystack: string;
}

function questRecord(log: ReflectQuestLog, queued: Set<string>): HistoryRecord {
  const outcome = STATE_LABELS[log.state].toLowerCase();
  const reason = log.reasonTag ? REASON_LABELS[log.reasonTag] : null;
  const kind: HistoryKind = log.state === 'recovery' ? 'recovery' : 'quest';
  return {
    id: `log:${log.id}`,
    date: log.date,
    time: timeOf(log.performedAt),
    kind,
    text: reason ? `${log.questName} · ${outcome} · ${reason}` : `${log.questName} · ${outcome}`,
    value: log.xpAwarded > 0 ? `+${log.xpAwarded} XP` : '0',
    queued: queued.has(log.id),
    title: `${log.questName} · ${outcome}`,
    section: kind === 'recovery' ? 'Hero' : 'Quests',
    to: kind === 'recovery' ? '/hero/recovery' : '/quests',
    fields: [
      { label: 'Outcome', value: STATE_LABELS[log.state] },
      ...(reason ? [{ label: 'Reason', value: reason }] : []),
      { label: 'Experience', value: `${log.xpAwarded} XP` },
      { label: 'Coins', value: String(log.coinsAwarded) },
      { label: 'Stat', value: log.statAffinity },
    ],
    haystack: `${log.questName} ${outcome} ${reason ?? ''} ${HISTORY_KIND_LABELS[kind]}`,
  };
}

function expenseRecord(expense: ExpenseDetail, categories: ExpenseCategory[], homeCurrency: CurrencyCode, queued: Set<string>): HistoryRecord {
  const category = categoryById(expense.categoryId, categories);
  const scanned = expense.source === 'ocr';
  const home = homeAmountOf(expense, homeCurrency);
  return {
    id: `expense:${expense.id}`,
    date: expense.occurredOnDate,
    time: timeOf(expense.loggedAt),
    kind: 'expense',
    text: `${expense.merchant ? `${category.name} — ${expense.merchant}` : category.name}${scanned ? ' · receipt scanned' : ''}`,
    value: formatMinor(expense.amountMinor, expense.currency),
    queued: queued.has(expense.id),
    title: expense.merchant ?? category.name,
    section: 'Money',
    to: '/finance',
    fields: [
      { label: 'Amount', value: formatMinor(expense.amountMinor, expense.currency) },
      ...(expense.currency === homeCurrency || home === null ? [] : [{ label: 'In home currency', value: formatMinor(home, homeCurrency) }]),
      { label: 'Category', value: category.name },
      { label: 'Source', value: scanned ? 'Receipt scan' : 'Typed' },
    ],
    haystack: `${category.name} ${expense.merchant ?? ''} ${HISTORY_KIND_LABELS.expense}`,
  };
}

function journalRecord(entry: JournalEntry, queued: Set<string>): HistoryRecord {
  return {
    id: `journal:${entry.id}`,
    date: entry.date,
    time: timeOf(entry.loggedAt),
    kind: 'journal',
    text: entry.title,
    value: `${entry.wordCount} words`,
    queued: queued.has(entry.id),
    title: 'Journal entry',
    section: 'Quick log',
    to: '/log',
    fields: [
      { label: 'Words', value: String(entry.wordCount) },
      { label: 'Mood', value: entry.mood === null ? 'not recorded' : String(entry.mood) },
      { label: 'Tags', value: entry.tags.length === 0 ? 'none' : entry.tags.join(', ') },
    ],
    haystack: HISTORY_KIND_LABELS.journal,
  };
}

function mealRecord(meal: Meal, queued: Set<string>): HistoryRecord {
  return {
    id: `meal:${meal.id}`,
    date: meal.date,
    time: timeOf(meal.loggedAt),
    kind: 'meal',
    text: meal.name,
    value: `${meal.calories} kcal`,
    queued: queued.has(meal.id),
    title: meal.name,
    section: 'Body and health',
    to: '/log',
    fields: [
      { label: 'Calories', value: `${meal.calories} kcal` },
      { label: 'Kind', value: meal.mealType === 'cooked' ? 'Cooked' : 'Ate out' },
      { label: 'Source', value: meal.sourceLabel },
    ],
    haystack: `${meal.name} ${HISTORY_KIND_LABELS.meal}`,
  };
}

function weightRecord(entry: WeightEntry, queued: Set<string>): HistoryRecord {
  return {
    id: `weight:${entry.id}`,
    date: entry.date,
    time: timeOf(entry.loggedAt),
    kind: 'weight',
    text: `Weight ${entry.kg} kg`,
    value: `${entry.kg} kg`,
    queued: queued.has(entry.id),
    title: `Weight ${entry.kg} kg`,
    section: 'Body and health',
    to: '/log',
    fields: [{ label: 'Value', value: `${entry.kg} kg` }, ...(entry.replacedKg === undefined ? [] : [{ label: 'Replaced', value: `${entry.replacedKg} kg` }])],
    haystack: HISTORY_KIND_LABELS.weight,
  };
}

function metricRecord(entry: HealthMetricEntry): HistoryRecord {
  const definition = metricDefinition(entry.key);
  const reading = formatMetricValue(entry.value, definition);
  return {
    id: `metric:${entry.key}:${entry.date}`,
    date: entry.date,
    time: timeOf(entry.loggedAt),
    kind: 'health',
    text: `${definition.name} ${reading}`,
    value: reading,
    queued: false,
    title: `${definition.name} ${reading}`,
    section: 'Body and health',
    to: '/log',
    fields: [
      { label: 'Value', value: reading },
      ...(definition.threshold ? [{ label: 'Threshold', value: `${definition.threshold.value} ${definition.unit}` }] : []),
      { label: 'Source', value: entry.source === 'health' ? 'Health app' : 'Typed' },
    ],
    haystack: `${definition.name} ${HISTORY_KIND_LABELS.health}`,
  };
}

function sideQuestRecord(sideQuest: SideQuest, queued: Set<string>): HistoryRecord {
  return {
    id: `side-quest:${sideQuest.id}`,
    date: sideQuest.date,
    time: timeOf(sideQuest.loggedAt),
    kind: 'side-quest',
    text: sideQuest.name,
    value: sideQuest.xpAwarded > 0 ? `+${sideQuest.xpAwarded} XP` : '0',
    queued: queued.has(sideQuest.id),
    title: `Side quest — ${sideQuest.name}`,
    section: 'Quick log',
    to: '/log',
    fields: [
      { label: 'Reward', value: `${sideQuest.xpAwarded} XP · ${sideQuest.coinsAwarded} coins` },
      { label: 'Stat', value: sideQuest.statAffinity },
      { label: 'Streak', value: 'Side quests never carry one' },
    ],
    haystack: `${sideQuest.name} ${HISTORY_KIND_LABELS['side-quest']}`,
  };
}

const GRANT_LABELS: Record<ReflectGrant['kind'], string> = { achievement: 'Achievement', title: 'Title', cosmetic: 'Cosmetic' };

function grantRecord(grant: ReflectGrant): HistoryRecord {
  return {
    id: `grant:${grant.kind}:${grant.id}`,
    date: grant.earnedAt.slice(0, 10),
    time: timeOf(grant.earnedAt),
    kind: 'hero',
    text: `${GRANT_LABELS[grant.kind]} — ${grant.name}`,
    value: 'earned',
    queued: false,
    title: grant.name,
    section: 'Hero',
    to: '/hero',
    fields: [
      { label: 'Kind', value: GRANT_LABELS[grant.kind] },
      { label: 'Earned', value: grant.earnedAt.slice(0, 10) },
      { label: 'Kept', value: 'Never removed — a grant once earned is kept' },
    ],
    haystack: `${grant.name} ${GRANT_LABELS[grant.kind]} ${HISTORY_KIND_LABELS.hero}`,
  };
}

export function deriveHistoryRecords(source: ReflectSource): HistoryRecord[] {
  const queued = new Set(source.queuedIds);
  return [
    ...source.logs.map(log => questRecord(log, queued)),
    ...source.expenses.map(expense => expenseRecord(expense, source.categories, source.homeCurrency, queued)),
    ...source.journal.map(entry => journalRecord(entry, queued)),
    ...source.meals.map(meal => mealRecord(meal, queued)),
    ...source.weights.map(entry => weightRecord(entry, queued)),
    ...source.metricEntries.map(metricRecord),
    ...source.sideQuests.map(sideQuest => sideQuestRecord(sideQuest, queued)),
    ...source.grants.map(grantRecord),
  ].sort((left, right) => right.date.localeCompare(left.date) || right.time.localeCompare(left.time) || right.id.localeCompare(left.id));
}

function historyTotals(source: ReflectSource): string[] {
  const counted = scheduled(source.logs);
  const held = counted.filter(log => holdsOccurrence(log.state)).length;
  const words = source.journal.reduce((total, entry) => total + entry.wordCount, 0);
  const spent = source.expenses.reduce((total, expense) => total + (homeAmountOf(expense, source.homeCurrency) ?? 0), 0);
  return [
    `${counted.length} quest outcomes · ${held} kept`,
    `${source.expenses.length} expenses · ${formatMinor(spent, source.homeCurrency)}`,
    `${source.journal.length} journal entries · ${words.toLocaleString(DEFAULT_LOCALE)} words`,
    `${source.metricEntries.length} metric entries · ${source.meals.length} meals · ${source.weights.length} weights`,
  ];
}

export function deriveHistory(source: ReflectSource, filter: HistoryFilter, query: string, page = 1): HistoryView {
  const records = deriveHistoryRecords(source);
  const needle = query.trim().toLowerCase();
  const matched = records.filter(record => (filter === 'all' || record.kind === filter) && (needle.length === 0 || record.haystack.toLowerCase().includes(needle)));

  const pageCount = Math.max(1, Math.ceil(matched.length / HISTORY_PAGE_SIZE));
  const start = (Math.min(Math.max(page, 1), pageCount) - 1) * HISTORY_PAGE_SIZE;
  const window = matched.slice(start, start + HISTORY_PAGE_SIZE);

  const groups: HistoryGroup[] = [];
  for (const record of window) {
    const label = record.date === source.today ? `Today · ${formatDayName(record.date)}` : formatDayName(record.date);
    const group = groups.at(-1);
    if (group?.date === record.date) group.rows.push(toRow(record));
    else groups.push({ date: record.date, label, rows: [toRow(record)] });
  }

  const unfiltered = filter === 'all' && needle.length === 0;
  return {
    countLabel: unfiltered ? `${records.length} record${records.length === 1 ? '' : 's'}` : `${matched.length} matching record${matched.length === 1 ? '' : 's'}`,
    groups,
    totals: historyTotals(source),
    pageCount,
  };
}

function toRow(record: HistoryRecord): HistoryRow {
  return { id: record.id, time: record.time, kind: record.kind, text: record.text, value: record.value, queued: record.queued };
}

const NOTHING_RECORDED: HistoryDetail = { id: '', kind: 'quest', title: 'Nothing recorded yet', when: '', section: 'Quests', to: '/quests', fields: [] };

export function deriveRecord(source: ReflectSource, recordId: string): HistoryDetail {
  const records = deriveHistoryRecords(source);
  const record = records.find(candidate => candidate.id === recordId) ?? records[0];
  if (!record) return NOTHING_RECORDED;
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    when: `${record.date === source.today ? 'Today' : formatDayName(record.date)}${record.time ? ` ${record.time}` : ''}`,
    section: record.section,
    to: record.to,
    fields: record.fields,
  };
}

function xpIn(source: ReflectSource, from: string, to: string): number {
  const logXp = within(source.logs, from, to, log => log.date).reduce((total, log) => total + log.xpAwarded, 0);
  const sideXp = within(source.sideQuests, from, to, sideQuest => sideQuest.date).reduce((total, sideQuest) => total + sideQuest.xpAwarded, 0);
  return logXp + sideXp;
}

function spendIn(source: ReflectSource, from: string, to: string): number {
  return within(source.expenses, from, to, expense => expense.occurredOnDate).reduce((total, expense) => total + (homeAmountOf(expense, source.homeCurrency) ?? 0), 0);
}

function delta(current: number, previous: number): number | undefined {
  return previous > 0 ? Number(((current - previous) / previous).toFixed(4)) : undefined;
}

function kpis(source: ReflectSource, period: InsightPeriod, from: string, previousFrom: string, previousTo: string): InsightKpi[] {
  const whole = period === '365';
  const comparison = whole ? 'your whole history' : `vs the ${PERIOD_DAYS[period]} days before`;
  const current = adherenceOf(within(source.logs, from, source.today, log => log.date));
  const previous = adherenceOf(within(source.logs, previousFrom, previousTo, log => log.date));

  const best = [...source.streaks].sort((left, right) => right.bestRunDays - left.bestRunDays)[0];
  const currentXp = xpIn(source, from, source.today);
  const currentSpend = spendIn(source, from, source.today);

  return [
    {
      id: 'kept',
      label: 'Quests kept',
      value: current.ratio ?? 0,
      positiveIs: whole ? 'neither' : 'up',
      ...(whole || previous.ratio === null || current.ratio === null ? {} : { delta: delta(current.ratio, previous.ratio) }),
      comparison: current.ratio === null ? 'no occurrences logged yet' : comparison,
      format: { style: 'percent' },
    },
    {
      id: 'streak',
      label: 'Longest streak',
      value: best?.bestRunDays ?? 0,
      unit: 'days',
      positiveIs: 'neither',
      comparison: best && best.bestRunDays > 0 ? best.questName : 'no streak recorded yet',
    },
    {
      id: 'xp',
      label: 'XP earned',
      value: currentXp,
      positiveIs: whole ? 'neither' : 'up',
      ...(whole ? {} : { delta: delta(currentXp, xpIn(source, previousFrom, previousTo)) }),
      comparison,
    },
    {
      id: 'spend',
      label: 'Spent',
      value: currentSpend / 100,
      positiveIs: whole ? 'neither' : 'down',
      ...(whole ? {} : { delta: delta(currentSpend, spendIn(source, previousFrom, previousTo)) }),
      comparison,
      format: { style: 'currency', currency: source.homeCurrency },
    },
  ];
}

function adherenceByQuest(logs: ReflectQuestLog[]): Bar[] {
  const perQuest = new Map<string, { id: string; label: string; value: number; caption: string; logs: ReflectQuestLog[] }>();
  for (const log of scheduled(logs)) {
    const entry = perQuest.get(log.questId) ?? { id: log.questId, label: log.questName, value: 0, caption: '', logs: [] };
    entry.logs.push(log);
    perQuest.set(log.questId, entry);
  }

  return [...perQuest.values()]
    .map(entry => {
      const value = percent(adherenceOf(entry.logs).ratio ?? 0);
      return { id: entry.id, label: entry.label, value, caption: `${value}%` };
    })
    .sort((left, right) => right.value - left.value);
}

function adherenceByWeekday(logs: ReflectQuestLog[]): Bar[] {
  return WEEKDAYS.map(day => {
    const ratio = adherenceOf(logs.filter(log => weekdayOf(log.date) === day)).ratio;
    const value = ratio === null ? 0 : percent(ratio);
    return { id: day, label: WEEKDAY_LABELS[day], value, caption: ratio === null ? 'no entries' : `${value}%` };
  });
}

function weakestWeekday(bars: Bar[]): Weekday | null {
  const rated = bars.filter(bar => bar.caption !== 'no entries');
  if (rated.length < 2) return null;
  return (rated.reduce((weakest, bar) => (bar.value < weakest.value ? bar : weakest)).id as Weekday) ?? null;
}

/** Month keys, stepped as integers rather than through `Date` — a `toISOString` round trip lands in the previous month east of UTC. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const last = to.slice(0, 7);
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));

  for (let key = from.slice(0, 7); key <= last;) {
    months.push(key);
    month = month === 12 ? ((year += 1), 1) : month + 1;
    key = `${year}-${String(month).padStart(2, '0')}`;
  }

  return months;
}

function xpByMonth(source: ReflectSource, from: string): Bar[] {
  return monthsBetween(from, source.today).map(month => {
    const value = xpIn(source, `${month}-01`, `${month}-31`);
    return {
      id: month,
      label: toDate(`${month}-01`).toLocaleDateString(DEFAULT_LOCALE, { month: 'short' }),
      value,
      caption: value === 0 ? 'no entries' : `${value.toLocaleString(DEFAULT_LOCALE)} XP`,
    };
  });
}

function reasonBars(logs: ReflectQuestLog[]): Bar[] {
  const counts = new Map<string, { id: string; label: string; value: number; caption: string }>();
  for (const log of logs) {
    if (!log.reasonTag) continue;
    const entry = counts.get(log.reasonTag) ?? { id: log.reasonTag, label: REASON_LABELS[log.reasonTag], value: 0, caption: '' };
    entry.value += 1;
    entry.caption = String(entry.value);
    counts.set(log.reasonTag, entry);
  }
  return rank(counts).slice(0, 6);
}

function spendBars(source: ReflectSource, from: string): Bar[] {
  const counts = new Map<string, { id: string; label: string; value: number; caption: string }>();
  for (const expense of within(source.expenses, from, source.today, item => item.occurredOnDate)) {
    const category = categoryById(expense.categoryId, source.categories);
    const entry = counts.get(category.id) ?? { id: category.id, label: category.name, value: 0, caption: '' };
    entry.value += homeAmountOf(expense, source.homeCurrency) ?? 0;
    entry.caption = formatMinor(entry.value, source.homeCurrency);
    counts.set(category.id, entry);
  }
  return rank(counts).slice(0, 6);
}

function trendSeries(source: ReflectSource, from: string): TrendSeries[] {
  const series: TrendSeries[] = [];

  const weights = within(source.weights, from, source.today, entry => entry.date).sort((left, right) => left.date.localeCompare(right.date));
  if (weights.length >= 2) {
    const first = weights[0] as WeightEntry;
    const last = weights.at(-1) as WeightEntry;
    const move = Number((last.kg - first.kg).toFixed(1));
    series.push({
      id: 'weight',
      name: 'Weight',
      value: `${last.kg} kg · ${movement(move)}`,
      points: weights.map(entry => entry.kg),
    });
  }

  for (const definition of HEALTH_METRICS) {
    const entries = within(
      source.metricEntries.filter(entry => entry.key === definition.key),
      from,
      source.today,
      entry => entry.date,
    ).sort((left, right) => left.date.localeCompare(right.date));
    if (entries.length < 2) continue;
    series.push({
      id: definition.key,
      name: definition.name,
      value: `${formatMetricValue(mean(entries.map(entry => entry.value)), definition)} average`,
      points: entries.map(entry => entry.value),
    });
  }

  return series;
}

export function deriveInsights(source: ReflectSource, period: InsightPeriod): InsightsView {
  const days = PERIOD_DAYS[period];
  const from = shiftDate(source.today, -(days - 1));
  const previousTo = shiftDate(from, -1);
  const previousFrom = shiftDate(previousTo, -(days - 1));

  const logs = within(source.logs, from, source.today, log => log.date);
  const byQuest = adherenceByQuest(logs);
  const byWeekday = adherenceByWeekday(scheduled(logs));
  const weakest = weakestWeekday(byWeekday);
  const reasons = reasonBars(logs);
  const spend = spendBars(source, from);
  const months = xpByMonth(source, from);
  const topReason = reasons[0];
  const topCategory = spend[0];

  return {
    periodNote: PERIOD_NOTES[period],
    kpis: kpis(source, period, from, previousFrom, previousTo),
    adherenceByQuest: byQuest,
    adherenceByWeekday: byWeekday,
    weekdayNote: weakest ? `${WEEKDAY_LABELS[weakest]} is your weakest weekday over this period.` : 'Not enough occurrences yet to tell one weekday from another.',
    xpByMonth: months,
    xpNote: months.some(month => month.value > 0) ? 'Experience has never decreased. The flat months are pauses, not losses.' : NOTHING_YET,
    reasons,
    reasonsNote: topReason
      ? `${topReason.label} is the reason you give most, ${topReason.value} time${topReason.value === 1 ? '' : 's'}.`
      : 'No reasons were given in this period.',
    spend,
    spendNote: topCategory ? `${topCategory.label} is your largest category at ${topCategory.caption}.` : 'No expenses were logged in this period.',
    trends: trendSeries(source, from),
  };
}

function isoWeek(date: string): number {
  const parsed = toDate(date);
  const thursday = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000) - ((firstThursday.getUTCDay() + 6) % 7) / 7);
}

type DayOutcome = ReviewQuestRow['days'][number];

function dayOutcome(log: ReflectQuestLog | undefined): DayOutcome {
  if (!log || CARRIED_STATES.includes(log.state)) return 'none';
  if (log.state === 'partial') return 'partial';
  return holdsOccurrence(log.state) ? 'kept' : 'missed';
}

function reviewQuests(logs: ReflectQuestLog[], weekStart: string): ReviewQuestRow[] {
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));
  const perQuest = new Map<string, { id: string; title: string; logs: ReflectQuestLog[] }>();
  for (const log of logs) {
    const entry = perQuest.get(log.questId) ?? { id: log.questId, title: log.questName, logs: [] };
    entry.logs.push(log);
    perQuest.set(log.questId, entry);
  }

  return [...perQuest.values()].map(entry => {
    const outcomes = days.map(day => dayOutcome(entry.logs.find(log => log.date === day)));
    const occurrences = outcomes.filter(outcome => outcome !== 'none').length;
    const held = outcomes.filter(outcome => outcome === 'kept' || outcome === 'partial').length;
    return { id: entry.id, title: entry.title, result: `${held} of ${occurrences}`, days: outcomes };
  });
}

const AVERAGE_WEEKS = 8;

function moneyFacts(source: ReflectSource, weekStart: string, weekEnd: string): { facts: ReviewFact[]; headline: string; note: string; spent: number; count: number } {
  const expenses = within(source.expenses, weekStart, weekEnd, expense => expense.occurredOnDate);
  const spent = expenses.reduce((total, expense) => total + (homeAmountOf(expense, source.homeCurrency) ?? 0), 0);
  const priorSpend = within(source.expenses, shiftDate(weekStart, -7 * AVERAGE_WEEKS), shiftDate(weekStart, -1), expense => expense.occurredOnDate).reduce(
    (total, expense) => total + (homeAmountOf(expense, source.homeCurrency) ?? 0),
    0,
  );
  const average = Math.round(priorSpend / AVERAGE_WEEKS);
  const againstAverage = average === 0 ? '' : `, ${formatMinor(Math.abs(spent - average), source.homeCurrency)} ${spent <= average ? 'below' : 'above'} your weekly average`;
  const spendDays = new Set(expenses.map(expense => expense.occurredOnDate));
  const noSpendDays = 7 - spendDays.size;

  const byCategory = new Map<string, { id: string; label: string; value: number; caption: string; count: number }>();
  for (const expense of expenses) {
    const category = categoryById(expense.categoryId, source.categories);
    const entry = byCategory.get(category.id) ?? { id: category.id, label: category.name, value: 0, caption: '', count: 0 };
    entry.value += homeAmountOf(expense, source.homeCurrency) ?? 0;
    entry.count += 1;
    byCategory.set(category.id, entry);
  }
  const biggest = rank(byCategory)[0];

  const renewed = source.subscriptions.filter(
    subscription => subscription.lastConfirmedDate !== null && subscription.lastConfirmedDate >= weekStart && subscription.lastConfirmedDate <= weekEnd,
  );

  return {
    spent,
    count: expenses.length,
    headline:
      expenses.length === 0
        ? 'Nothing was logged as spent this week.'
        : `${formatMinor(spent, source.homeCurrency)} across ${expenses.length} expense${expenses.length === 1 ? '' : 's'}${againstAverage}.`,
    facts: [
      { label: 'Spent', value: spent / 100, comparison: 'over the week', format: { style: 'currency', currency: source.homeCurrency } },
      { label: 'No-spend days', value: noSpendDays, comparison: `${spendDays.size} day${spendDays.size === 1 ? '' : 's'} with an expense` },
      ...(biggest
        ? [
            {
              label: 'Biggest category',
              value: biggest.value / 100,
              comparison: `${biggest.label} · ${biggest.count} expense${biggest.count === 1 ? '' : 's'}`,
              format: { style: 'currency', currency: source.homeCurrency } as Intl.NumberFormatOptions,
            },
          ]
        : []),
    ],
    note:
      renewed.length === 0
        ? 'No subscription renewed inside this week.'
        : `${renewed.length} subscription${renewed.length === 1 ? '' : 's'} renewed this week: ${renewed.map(subscription => subscription.name).join(', ')}.`,
  };
}

function bodyFacts(source: ReflectSource, weekStart: string, weekEnd: string): { facts: ReviewFact[]; headline: string; gap: ReviewView['bodyGap']; weight: number | null } {
  const facts: ReviewFact[] = [];
  const named: string[] = [];
  const thin: string[] = [];

  const weights = within(source.weights, weekStart, weekEnd, entry => entry.date).sort((left, right) => left.date.localeCompare(right.date));
  let weightMove: number | null = null;
  if (weights.length >= 2) {
    const first = weights[0] as WeightEntry;
    const last = weights.at(-1) as WeightEntry;
    weightMove = Number((last.kg - first.kg).toFixed(1));
    facts.push({
      label: 'Weight',
      value: last.kg,
      unit: 'kg',
      comparison: `${movement(weightMove)} over the week`,
    });
    named.push('weight');
  } else thin.push('weight');

  for (const definition of HEALTH_METRICS) {
    const entries = within(
      source.metricEntries.filter(entry => entry.key === definition.key),
      weekStart,
      weekEnd,
      entry => entry.date,
    );
    if (entries.length >= 3) {
      facts.push({
        label: `Average ${definition.name.toLowerCase()}`,
        value: Number(mean(entries.map(entry => entry.value)).toFixed(definition.precision)),
        unit: definition.unit,
        comparison: `${entries.length} day${entries.length === 1 ? '' : 's'} logged`,
      });
      named.push(definition.name.toLowerCase());
    } else thin.push(definition.name.toLowerCase());
  }

  const thinnest = thin[0];
  return {
    facts,
    weight: weightMove,
    headline: named.length === 0 ? 'Too few body entries this week to read anything from.' : `${sentence(list(named))} had enough entries to be worth reading.`,
    gap: thinnest
      ? {
          title: `Not enough ${thinnest} entries to say anything`,
          body: 'Rather than guess a weekly average from one or two numbers, this section stays empty — it will fill in on its own.',
        }
      : null,
  };
}

export function deriveReview(source: ReflectSource, local: ReviewLocalState): ReviewView {
  const weekStart = shiftDate(startOfWeek(source.today), -7);
  const weekEnd = shiftDate(weekStart, 6);

  const logs = within(source.logs, weekStart, weekEnd, log => log.date);
  const counted = scheduled(logs);
  const held = counted.filter(log => holdsOccurrence(log.state)).length;
  const partials = counted.filter(log => log.state === 'partial').length;
  const withReason = counted.filter(log => !holdsOccurrence(log.state) && log.reasonTag !== null).length;
  const keptRatio = counted.length === 0 ? 0 : held / counted.length;

  const reasons = reasonBars(counted);
  const topReason = reasons[0];
  const money = moneyFacts(source, weekStart, weekEnd);
  const body = bodyFacts(source, weekStart, weekEnd);
  const journalCount = within(source.journal, weekStart, weekEnd, entry => entry.date).length;
  const mealCount = within(source.meals, weekStart, weekEnd, meal => meal.date).length;
  const weekXp = xpIn(source, weekStart, weekEnd);

  const prompts: ReviewPrompt[] = REVIEW_PROMPTS.map(prompt => ({ ...prompt, answer: local.answers[prompt.id] ?? '' }));

  const summaryLines = [
    counted.length === 0 ? 'No occurrences were logged this week' : `${held} of ${counted.length} kept · ${percent(keptRatio)}%`,
    `${formatMinor(money.spent, source.homeCurrency)} spent across ${money.count} expense${money.count === 1 ? '' : 's'}`,
    body.weight === null ? 'Not enough weight entries to read a trend' : `Weight ${movement(body.weight)}${body.weight === 0 ? '' : ' kg'}`,
    topReason ? `Most common reason for a miss: ${topReason.label} (${topReason.value})` : 'No reasons were given for a miss this week',
    `${weekXp.toLocaleString(DEFAULT_LOCALE)} XP earned`,
  ];

  return {
    weekLabel: `Week ${isoWeek(weekStart)} · ${formatRange(weekStart, weekEnd)}`,
    keptHeadline:
      counted.length === 0
        ? 'Nothing was logged last week. The week stays empty rather than guessing at it.'
        : `${held} of ${counted.length} occurrences. ${partials} partial${partials === 1 ? '' : 's'}, ${withReason} miss${withReason === 1 ? '' : 'es'} with a reason.`,
    quests: reviewQuests(logs, weekStart),
    keptPattern: topReason
      ? `The pattern worth naming: ${topReason.label} accounts for ${topReason.value} of the misses this week.`
      : 'No pattern to name this week — nothing was missed with a reason attached.',
    moneyHeadline: money.headline,
    moneyFacts: money.facts,
    moneyNote: money.note,
    bodyHeadline: body.headline,
    bodyFacts: body.facts,
    bodyGap: body.gap,
    prompts,
    completion: local.complete ? { title: `Week ${isoWeek(weekStart)} closed`, body: 'Saved as a journal entry and to History.', lines: summaryLines } : null,
    glance: [
      counted.length === 0 ? 'No occurrences logged' : `${counted.length} occurrences · ${held} kept · ${percent(keptRatio)}%`,
      `Level ${source.hero.level} · ${weekXp.toLocaleString(DEFAULT_LOCALE)} XP earned`,
      `HP ${source.hero.hp} of ${source.hero.hpMax}`,
      `${journalCount} journal entr${journalCount === 1 ? 'y' : 'ies'} · ${mealCount} meal${mealCount === 1 ? '' : 's'} logged`,
    ],
    carried: 'Anything you decide here reaches the Planning Board as a suggestion. The board never rewrites itself.',
  };
}
