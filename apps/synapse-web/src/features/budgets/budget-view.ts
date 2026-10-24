import { type BudgetEntry, type BudgetSpec, type BudgetWindow } from '@/features/catalog/catalog-spec.types';
import { formatDateTime, formatNumber, formatUsd } from '@/features/shared/format';
import { appName, scopeName, windowName } from '@/features/shared/naming';
import { type BudgetStatusEntryResponse, type BudgetStatusResponse, type BudgetSubjectCounterResponse } from '@/lib/apis/api-types.gen';

export type LimitLevel = 'clear' | 'near' | 'at';

export type MeterIntent = 'accent' | 'warning' | 'danger';

export type Measure = 'cost' | 'calls';

export interface Meter {
  measure: Measure;
  used: number;
  limit: number;
  percent: number;
  level: LimitLevel;
  intent: MeterIntent;
  text: string;
}

export interface SubjectRow {
  key: string;
  subjectType: string;
  subjectId: string;
  calls: number;
  listCostUsd: number;
  percent: number;
  intent: MeterIntent;
  /** The app's own counter: calls made for the app itself, or a removed per-app budget's total that lingers until its window ends */
  appCounter: boolean;
}

export type BudgetUsageView =
  { kind: 'app'; meters: Meter[] } | { kind: 'subject'; summary: string; rows: SubjectRow[]; appCounterShown: boolean } | { kind: 'unavailable'; reason: UnavailableReason };

/** `failed`: live usage could not be read; `pending`: the budget is newer than the usage report, which catches up within a minute. */
export type UnavailableReason = 'failed' | 'pending';

export interface BudgetCardView {
  index: number;
  budget: BudgetSpec;
  title: string;
  limits: string;
  resets?: string;
  level: LimitLevel;
  usage: BudgetUsageView;
}

const NEAR_BASIS_POINTS = 8_000;
const FULL_BASIS_POINTS = 10_000;
const APP_SUBJECT = 'app';

const LEVEL_INTENTS: Readonly<Record<LimitLevel, MeterIntent>> = { clear: 'accent', near: 'warning', at: 'danger' };
const LEVEL_RANK: Readonly<Record<LimitLevel, number>> = { clear: 0, near: 1, at: 2 };
const WINDOW_PHRASES: Readonly<Record<BudgetWindow, string>> = { '1h': 'this hour', '1d': 'today', '30d': 'in this 30-day window' };

/** Rounded to basis points first, so floating-point noise cannot put the level and the shown percentage on different sides of a threshold. */
const basisPoints = (used: number, limit: number): number => Math.round((used / limit) * FULL_BASIS_POINTS);

/** A limit of zero refuses every call, so it reads as reached however little was used. */
export function limitLevel(used: number, limit: number): LimitLevel {
  if (limit <= 0) return 'at';
  const points = basisPoints(used, limit);
  if (points >= FULL_BASIS_POINTS) return 'at';
  return points >= NEAR_BASIS_POINTS ? 'near' : 'clear';
}

export function percentUsed(used: number, limit: number): number {
  return limit <= 0 ? 100 : Math.floor(basisPoints(used, limit) / 100);
}

export function levelIntent(level: LimitLevel): MeterIntent {
  return LEVEL_INTENTS[level];
}

export function highestLevel(levels: readonly LimitLevel[]): LimitLevel {
  return levels.reduce<LimitLevel>((highest, level) => (LEVEL_RANK[level] > LEVEL_RANK[highest] ? level : highest), 'clear');
}

const plural = (count: number, one: string, many: string): string => `${formatNumber(count)} ${count === 1 ? one : many}`;

export function budgetTitle(budget: Pick<BudgetSpec, 'app' | 'per' | 'window'>): string {
  return `${appName(budget.app)} — ${scopeName(budget.per)} — ${windowName(budget.window)}`;
}

export function limitsText(budget: Pick<BudgetSpec, 'maxCalls' | 'maxListCostUsd'>): string {
  const parts = [
    ...(budget.maxListCostUsd === undefined ? [] : [formatUsd(budget.maxListCostUsd)]),
    ...(budget.maxCalls === undefined ? [] : [plural(budget.maxCalls, 'call', 'calls')]),
  ];
  return parts.length === 0 ? 'No limit set' : parts.join(' and ');
}

function amountText(measure: Measure, value: number): string {
  return measure === 'cost' ? formatUsd(value) : formatNumber(value);
}

function meterOf(measure: Measure, used: number, limit: number): Meter {
  const level = limitLevel(used, limit);
  const percent = percentUsed(used, limit);
  const unit = measure === 'calls' ? ' calls' : '';
  return { measure, used, limit, percent, level, intent: levelIntent(level), text: `${amountText(measure, used)} of ${amountText(measure, limit)}${unit} (${percent}%)` };
}

export function metersOf(budget: Pick<BudgetSpec, 'maxCalls' | 'maxListCostUsd'>, usage: { calls: number; listCostUsd: number }): Meter[] {
  return [
    ...(budget.maxListCostUsd === undefined ? [] : [meterOf('cost', usage.listCostUsd, budget.maxListCostUsd)]),
    ...(budget.maxCalls === undefined ? [] : [meterOf('calls', usage.calls, budget.maxCalls)]),
  ];
}

function subjectRowOf(budget: BudgetSpec, counter: BudgetSubjectCounterResponse): SubjectRow {
  const meters = metersOf(budget, counter);
  const level = highestLevel(meters.map(meter => meter.level));
  return {
    key: `${counter.subjectType}:${counter.subjectId}`,
    subjectType: counter.subjectType,
    subjectId: counter.subjectId,
    calls: counter.calls,
    listCostUsd: counter.listCostUsd,
    percent: Math.max(0, ...meters.map(meter => meter.percent)),
    intent: levelIntent(level),
    appCounter: counter.subjectType === APP_SUBJECT,
  };
}

function highestPhrases(budget: BudgetSpec, top: readonly BudgetSubjectCounterResponse[]): string[] {
  if (top.length === 0) return [];
  const highestCost = Math.max(...top.map(counter => counter.listCostUsd));
  const highestCalls = Math.max(...top.map(counter => counter.calls));
  return [
    ...(budget.maxListCostUsd === undefined ? [] : [`highest ${formatUsd(highestCost)} of ${formatUsd(budget.maxListCostUsd)}`]),
    ...(budget.maxCalls === undefined ? [] : [`highest ${formatNumber(highestCalls)} of ${plural(budget.maxCalls, 'call', 'calls')}`]),
  ];
}

export interface SubjectUsageSummary {
  activeSubjects: number;
  /** Absent when it was counted against other limits than the budget's, so it says nothing about this budget */
  atLimit?: number;
  top: readonly BudgetSubjectCounterResponse[];
}

function atLimitPhrase(atLimit: number | undefined): string[] {
  if (atLimit === undefined) return [];
  if (atLimit === 0) return ['none at the limit'];
  return [atLimit === 1 ? '1 at its limit' : `${formatNumber(atLimit)} at their limit`];
}

export function subjectSummary(budget: BudgetSpec, usage: SubjectUsageSummary): string {
  const window = WINDOW_PHRASES[budget.window];
  if (usage.activeSubjects === 0) return `No users active ${window}`;
  return [`${plural(usage.activeSubjects, 'user', 'users')} active ${window}`, ...atLimitPhrase(usage.atLimit), ...highestPhrases(budget, usage.top)].join(' · ');
}

function specOf(entry: BudgetStatusEntryResponse): BudgetSpec {
  return {
    app: entry.app,
    per: entry.per,
    window: entry.window,
    ...(entry.maxCalls !== undefined && { maxCalls: entry.maxCalls }),
    ...(entry.maxListCostUsd !== undefined && { maxListCostUsd: entry.maxListCostUsd }),
  };
}

const sameLimits = (left: BudgetSpec, right: BudgetSpec): boolean => left.maxCalls === right.maxCalls && left.maxListCostUsd === right.maxListCostUsd;

function statusCard(entry: BudgetStatusEntryResponse, budget: BudgetSpec = specOf(entry), index = entry.index): BudgetCardView {
  const base = { index, budget, title: budgetTitle(budget), limits: limitsText(budget), resets: formatDateTime(entry.windowEnd) };
  const usage = entry.usage;
  if (usage.kind === 'app') {
    const meters = metersOf(budget, usage);
    return { ...base, level: highestLevel(meters.map(meter => meter.level)), usage: { kind: 'app', meters } };
  }
  const rows = usage.top.map(counter => subjectRowOf(budget, counter));
  const rowLevels = usage.top.flatMap(counter => metersOf(budget, counter).map(meter => meter.level));
  const atLimit = sameLimits(budget, specOf(entry)) ? usage.atLimit : undefined;
  return {
    ...base,
    level: atLimit ? 'at' : highestLevel(rowLevels),
    usage: { kind: 'subject', summary: subjectSummary(budget, { ...usage, atLimit }), rows, appCounterShown: rows.some(row => row.appCounter) },
  };
}

export function statusCards(status: BudgetStatusResponse): BudgetCardView[] {
  return [...status.budgets].sort((left, right) => left.index - right.index).map(entry => statusCard(entry));
}

function catalogCard({ index, ...budget }: BudgetEntry, reason: UnavailableReason): BudgetCardView {
  return { index, budget, title: budgetTitle(budget), limits: limitsText(budget), level: 'clear', usage: { kind: 'unavailable', reason } };
}

export function catalogCards(budgets: readonly BudgetEntry[]): BudgetCardView[] {
  return budgets.map(budget => catalogCard(budget, 'failed'));
}

export interface BudgetCardSources {
  status?: BudgetStatusResponse;
  active?: { version: number; budgets: readonly BudgetEntry[] };
}

/** The report trails a publish by up to a minute, so the active catalog sets budgets and limits; counters are keyed by app, scope and window, never limits. */
export function budgetCards({ status, active }: BudgetCardSources): BudgetCardView[] {
  if (!active) return status ? statusCards(status) : [];
  if (!status) return catalogCards(active.budgets);
  if (status.catalogVersion === active.version) return statusCards(status);
  const entries = new Map(status.budgets.map(entry => [entry.index, entry]));
  return active.budgets.map(budget => {
    const entry = entries.get(budget.index);
    if (!entry || entry.app !== budget.app || entry.per !== budget.per || entry.window !== budget.window) return catalogCard(budget, 'pending');
    const { index, ...spec } = budget;
    return statusCard(entry, spec, index);
  });
}
