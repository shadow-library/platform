import { type ReactNode } from 'react';

import { type AiQuotaResponse, type ContentMode, type CostBreakdownItem, type CostTier } from '@/lib/apis';

export type UsagePeriod = 'week' | 'month' | 'all';

export interface UsagePeriodOption {
  value: UsagePeriod;
  label: string;
}

export const USAGE_PERIODS: readonly UsagePeriodOption[] = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export interface PeriodTotals {
  totalCostUsd: number;
  last7DaysCostUsd: number;
  last30DaysCostUsd: number;
}

export interface DayCharge {
  day: string;
  label: string;
  calls: number;
  costUsd: number;
}

export interface DayCostInput {
  day: string;
  calls: number;
  costUsd: number;
}

export interface UsageBarItem {
  key: string;
  label: string;
  pct: number;
  tip: string;
}

export interface BreakdownRow {
  key: string;
  label: ReactNode;
  calls: number;
  costUsd: number;
  estimatedCostUsd?: number;
  tokens?: string;
}

export interface QuotaDimension {
  used: number;
  limit: number;
  pct: number;
}

export interface QuotaMeterView {
  windowLabel: string;
  spend?: QuotaDimension;
  calls?: QuotaDimension;
  pct: number;
  intent: 'success' | 'danger';
  resetsAt: string | null;
}

export interface RunLabelInput {
  graph: string;
  target: string;
}

export interface CallChargeInput {
  costUsd?: string | null;
  costSource?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface ListPrice {
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
}

export interface ChargeRowItem {
  key: string;
  label: string;
  pct: number;
  amount: string;
  estimated: boolean;
}

export interface CallCharge {
  usd: number | null;
  estimated: boolean;
}

export interface PageRange {
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const QUOTA_DANGER_PCT = 90;
const DAY_LABEL_STEP = 5;

const GROUP_LABEL: Record<string, string> = {
  writing: 'Writing',
  planning: 'Planning',
  review: 'Review',
  chat: 'Chat',
  helper: 'Helpers',
  image: 'Illustrations',
};

const TIER_LABEL: Record<CostTier, string> = { economy: 'Economy', balanced: 'Balanced', performant: 'Performant' };

const CONTENT_MODE_LABEL: Record<ContentMode, string> = { standard: 'Standard', unrestricted: 'Unrestricted' };

const GRAPH_LABEL: Record<string, string> = {
  'chat-turn': 'Chat reply',
  'premise-enhance': 'Premise',
  'bible-audit': 'Story Bible audit',
  illustration: 'Illustration',
  'chapter-generation': 'Write chapter',
  'chapter-finalization': 'Finalize chapter',
  'bible-builder': 'Organise your notes',
  'novel-validation': 'Novel check',
};

const CALL_ROLE_LABEL: Record<string, string> = {
  generation: 'Draft',
  fix: 'Repair',
  revision: 'Revision',
  judge: 'Judge',
  review: 'Review',
  audit: 'Audit',
  continuity: 'Continuity',
  validation: 'Validation',
  chat: 'Chat reply',
  title: 'Title',
  compact: 'Compaction',
  extraction: 'Extraction',
  'chapter-extract': 'Chapter extraction',
  'chapter-summarize': 'Summary',
  plan: 'Plan',
  outline: 'Outline',
  bible: 'Story Bible',
  premise: 'Premise',
  image: 'Illustration',
};

function isKeyOf<T extends string>(record: Record<T, string>, key: string): key is T {
  return Object.hasOwn(record, key);
}

function sentenceCase(key: string): string {
  const words = key.replace(/^bible:/, '').replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.001) return '<$0.001';
  const tenthOfCent = Math.round(value * 1000) / 1000;
  if (tenthOfCent > 0 && tenthOfCent < 0.1) return `$${tenthOfCent.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatCompactTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 100_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function barPercent(value: number, max: number): number {
  return max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
}

export function periodCharge(totals: PeriodTotals, period: UsagePeriod): number {
  if (period === 'week') return totals.last7DaysCostUsd;
  if (period === 'month') return totals.last30DaysCostUsd;
  return totals.totalCostUsd;
}

export function periodLabel(period: UsagePeriod): string {
  return USAGE_PERIODS.find(option => option.value === period)?.label ?? '';
}

export function periodStart(period: UsagePeriod, now: Date): string | undefined {
  if (period === 'all') return undefined;
  const days = period === 'week' ? 7 : 30;
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function isUsagePeriod(value: string): value is UsagePeriod {
  return USAGE_PERIODS.some(option => option.value === value);
}

export function dailyCharges(byDay: readonly DayCostInput[], days: number, now: Date): DayCharge[] {
  const byKey = new Map(byDay.map(item => [item.day, item]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekday = days <= 7;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today - (days - 1 - i) * DAY_MS);
    const day = date.toISOString().slice(0, 10);
    const item = byKey.get(day);
    const labelled = weekday || (days - 1 - i) % DAY_LABEL_STEP === 0;
    const label = !labelled ? '' : weekday ? date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : String(date.getUTCDate());
    return { day, label, calls: item?.calls ?? 0, costUsd: item?.costUsd ?? 0 };
  });
}

export function groupLabel(key: string): string {
  return GROUP_LABEL[key] ?? sentenceCase(key);
}

export function tierLabel(key: string): string {
  return isKeyOf(TIER_LABEL, key) ? TIER_LABEL[key] : sentenceCase(key);
}

export function contentModeLabel(key: string): string {
  return isKeyOf(CONTENT_MODE_LABEL, key) ? CONTENT_MODE_LABEL[key] : sentenceCase(key);
}

export function callRoleLabel(role: string): string {
  return CALL_ROLE_LABEL[role] ?? sentenceCase(role);
}

export function runLabel({ graph, target }: RunLabelInput): string {
  const label = GRAPH_LABEL[graph] ?? sentenceCase(graph);
  const chapter = /^chapter-(\d+)$/.exec(target);
  return chapter ? `${label} ${chapter[1]}` : label;
}

// Mirrors the server's `classifyRowCost`: a row that predates `cost_source` and recorded no cost is priced from list prices, full input price included.
export function callCharge({ costUsd, costSource, inputTokens, outputTokens }: CallChargeInput, price?: ListPrice | null): CallCharge {
  if (costUsd != null) return { usd: Number(costUsd), estimated: costSource === 'estimate' };
  if (costSource != null || price === null) return { usd: 0, estimated: false };
  if (!price) return { usd: null, estimated: true };
  const usd = ((inputTokens ?? 0) / 1_000_000) * (price.inputPricePerMToken ?? 0) + ((outputTokens ?? 0) / 1_000_000) * (price.outputPricePerMToken ?? 0);
  return { usd, estimated: usd > 0 };
}

export function quotaWindowLabel(windowMs: number): string {
  if (windowMs >= DAY_MS && windowMs % DAY_MS === 0) return windowMs === DAY_MS ? 'Daily limit' : `${windowMs / DAY_MS}-day limit`;
  if (windowMs >= HOUR_MS && windowMs % HOUR_MS === 0) return windowMs === HOUR_MS ? 'Hourly limit' : `${windowMs / HOUR_MS}-hour limit`;
  return `${Math.max(1, Math.round(windowMs / MINUTE_MS))}-minute limit`;
}

function dimension(used: number, limit: number): QuotaDimension | undefined {
  if (limit <= 0) return undefined;
  return { used, limit, pct: Math.min(100, Math.round((used / limit) * 100)) };
}

export function quotaMeter(quota: AiQuotaResponse): QuotaMeterView {
  const spend = dimension(quota.costUsd, quota.maxCostUsd);
  const calls = dimension(quota.calls, quota.maxCalls);
  const pct = Math.max(spend?.pct ?? 0, calls?.pct ?? 0);
  return {
    windowLabel: quotaWindowLabel(quota.windowMs),
    spend,
    calls,
    pct,
    intent: pct >= QUOTA_DANGER_PCT ? 'danger' : 'success',
    resetsAt: quota.resetsAt ?? null,
  };
}

export function pageRange(offset: number, count: number, total: number): PageRange {
  return { from: count === 0 ? 0 : offset + 1, to: offset + count, hasPrevious: offset > 0, hasNext: offset + count < total };
}

function callsLabel(calls: number): string {
  return `${calls.toLocaleString()} call${calls === 1 ? '' : 's'}`;
}

export function dayBars(byDay: readonly DayCostInput[], days: number, now: Date): UsageBarItem[] {
  const charges = dailyCharges(byDay, days, now);
  const max = charges.reduce((m, day) => Math.max(m, day.costUsd), 0);
  return charges.map(day => ({
    key: day.day,
    label: day.label,
    pct: day.costUsd > 0 ? barPercent(day.costUsd, max) : 0,
    tip: `${day.day} · ${callsLabel(day.calls)} · ${formatUsd(day.costUsd)}`,
  }));
}

export function breakdownRows(items: readonly CostBreakdownItem[], label: (item: CostBreakdownItem) => string, withTokens = false): BreakdownRow[] {
  return items.map(item => ({
    key: item.key,
    label: label(item),
    calls: item.calls,
    costUsd: item.costUsd,
    estimatedCostUsd: item.estimatedCostUsd,
    tokens: withTokens ? `${item.inputTokens.toLocaleString()} / ${item.outputTokens.toLocaleString()}` : undefined,
  }));
}

export function estimateFooter(prefix: string, estimatedCostUsd: number): string {
  return estimatedCostUsd > 0 ? `${prefix} · ${formatUsd(estimatedCostUsd)} estimated` : prefix;
}

export function chargeRows(items: readonly CostBreakdownItem[], label: (key: string) => string): ChargeRowItem[] {
  const max = items.reduce((m, item) => Math.max(m, item.costUsd), 0);
  return items.map(item => ({
    key: item.key,
    label: label(item.key),
    pct: max > 0 ? Math.round((item.costUsd / max) * 100) : 0,
    amount: formatUsd(item.costUsd),
    estimated: item.estimatedCostUsd > 0,
  }));
}

export function periodFooter(period: UsagePeriod, estimatedCostUsd: number): string {
  if (period === 'all') return estimateFooter(periodLabel(period), estimatedCostUsd);
  return estimatedCostUsd > 0 ? `${periodLabel(period)} · may include estimates` : periodLabel(period);
}
