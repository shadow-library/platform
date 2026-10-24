import { Injectable } from '@shadow-library/app';

import { AppErrorCode } from '@server/classes';

import { roundUsd } from '@modules/catalog';

import { DAY_MS, DEFAULT_USAGE_RANGE_DAYS, MAX_USAGE_RANGE_DAYS, SELECTOR_TOKEN, SERIES_GROUPS, type SeriesGroup, USAGE_GROUPS, type UsageGroup } from './admin.constants';
import { LedgerReportRepository, type SeriesRow, type UsageFilter, type UsageRow } from './ledger-report.repository';

export interface UsageRangeQuery {
  from?: string;
  to?: string;
  app?: string;
  task?: string;
}

export interface UsageQuery extends UsageRangeQuery {
  groupBy?: string;
}

export type UsageSeriesQuery = UsageQuery;

export type UsageTotals = Omit<UsageRow, 'key'>;

export interface UsageReport {
  from: Date;
  to: Date;
  groupBy: UsageGroup;
  rows: UsageRow[];
  totals: UsageTotals;
}

export interface UsageSeriesPoint {
  day: string;
  calls: number;
  listCostUsd: number;
  billedCostUsd: number;
}

export interface UsageSeriesEntry {
  key: string | null;
  points: UsageSeriesPoint[];
  totals: UsageTotals;
}

export interface UsageSeriesReport {
  from: Date;
  to: Date;
  groupBy: SeriesGroup;
  days: string[];
  series: UsageSeriesEntry[];
  totals: UsageTotals;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function invalid(param: string, reason: string): never {
  return AppErrorCode.SYN_INVALID_REQUEST.throw({ param, reason });
}

function isUsageGroup(value: string): value is UsageGroup {
  return (USAGE_GROUPS as readonly string[]).includes(value);
}

/** A bare date is that day's UTC midnight; a date-time must carry its offset, because a zoneless one would silently mean the server's own. */
function parseInstant(param: string, value: string): Date {
  const instant = new Date(value);
  const shaped = DATE_ONLY.test(value) || DATE_TIME.test(value);
  const day = value.slice(0, 10);
  const valid = shaped && !Number.isNaN(instant.getTime()) && new Date(day).toISOString().startsWith(day);
  return valid ? instant : invalid(param, 'expected an ISO date or a date-time with an offset');
}

function isSeriesGroup(value: string): value is SeriesGroup {
  return (SERIES_GROUPS as readonly string[]).includes(value);
}

function parseToken(param: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return SELECTOR_TOKEN.test(value) ? value : invalid(param, 'expected 1 to 64 letters, digits, dots, underscores or hyphens');
}

function parseFilter(query: UsageRangeQuery): UsageFilter {
  const filter: UsageFilter = {};
  const app = parseToken('app', query.app);
  const task = parseToken('task', query.task);
  if (app !== undefined) filter.app = app;
  if (task !== undefined) filter.task = task;
  return filter;
}

function resolveRange(query: UsageRangeQuery, now: Date): { from: Date; to: Date } {
  const to = query.to === undefined ? now : parseInstant('to', query.to);
  const from = query.from === undefined ? new Date(to.getTime() - DEFAULT_USAGE_RANGE_DAYS * DAY_MS) : parseInstant('from', query.from);
  if (from.getTime() >= to.getTime()) return invalid('from', 'must be before to');
  if (to.getTime() - from.getTime() > MAX_USAGE_RANGE_DAYS * DAY_MS) return invalid('from', `the range cannot exceed ${MAX_USAGE_RANGE_DAYS} days`);
  return { from, to };
}

function utcDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const last = Math.floor((to.getTime() - 1) / DAY_MS) * DAY_MS;
  for (let day = Math.floor(from.getTime() / DAY_MS) * DAY_MS; day <= last; day += DAY_MS) days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}

function compareSeries(left: UsageSeriesEntry, right: UsageSeriesEntry): number {
  if (left.totals.listCostUsd !== right.totals.listCostUsd) return right.totals.listCostUsd - left.totals.listCostUsd;
  if (left.key === right.key) return 0;
  if (left.key === null) return 1;
  if (right.key === null) return -1;
  return left.key < right.key ? -1 : 1;
}

function sumRows(rows: UsageRow[]): UsageTotals {
  const totals: UsageTotals = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, listCostUsd: 0, billedCostUsd: 0 };
  for (const row of rows) {
    totals.calls += row.calls;
    totals.inputTokens += row.inputTokens;
    totals.cachedInputTokens += row.cachedInputTokens;
    totals.outputTokens += row.outputTokens;
    totals.reasoningTokens += row.reasoningTokens;
    totals.listCostUsd += row.listCostUsd;
    totals.billedCostUsd += row.billedCostUsd;
  }
  return { ...totals, listCostUsd: roundUsd(totals.listCostUsd), billedCostUsd: roundUsd(totals.billedCostUsd) };
}

@Injectable()
export class UsageService {
  constructor(private readonly ledger: LedgerReportRepository) {}

  async report(query: UsageQuery, now: Date = new Date()): Promise<UsageReport> {
    const groupBy = query.groupBy ?? 'app';
    if (!isUsageGroup(groupBy)) return invalid('groupBy', `expected one of ${USAGE_GROUPS.join(', ')}`);
    const filter = parseFilter(query);
    const { from, to } = resolveRange(query, now);

    const rows = await this.ledger.usage(groupBy, from, to, filter);
    return { from, to, groupBy, rows, totals: sumRows(rows) };
  }

  async series(query: UsageSeriesQuery, now: Date = new Date()): Promise<UsageSeriesReport> {
    const groupBy = query.groupBy ?? 'app';
    if (!isSeriesGroup(groupBy)) return invalid('groupBy', `expected one of ${SERIES_GROUPS.join(', ')}`);
    const filter = parseFilter(query);
    const { from, to } = resolveRange(query, now);
    const days = utcDays(from, to);

    const rows = await this.ledger.usageSeries(groupBy, from, to, filter);
    const byKey = new Map<string | null, Map<string, SeriesRow>>();
    for (const row of rows) {
      const perDay = byKey.get(row.key) ?? new Map<string, SeriesRow>();
      perDay.set(row.day, row);
      byKey.set(row.key, perDay);
    }

    const series = [...byKey].map(([key, perDay]): UsageSeriesEntry => {
      const points = days.map((day): UsageSeriesPoint => {
        const row = perDay.get(day);
        return { day, calls: row?.calls ?? 0, listCostUsd: roundUsd(row?.listCostUsd ?? 0), billedCostUsd: roundUsd(row?.billedCostUsd ?? 0) };
      });
      return { key, points, totals: sumRows([...perDay.values()]) };
    });
    series.sort(compareSeries);
    return { from, to, groupBy, days, series, totals: sumRows(rows) };
  }
}
