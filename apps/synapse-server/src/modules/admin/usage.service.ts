import { Injectable } from '@shadow-library/app';

import { AppErrorCode } from '@server/classes';

import { roundUsd } from '@modules/catalog';

import { DAY_MS, DEFAULT_USAGE_RANGE_DAYS, MAX_USAGE_RANGE_DAYS, USAGE_GROUPS, type UsageGroup } from './admin.constants';
import { LedgerReportRepository, type UsageRow } from './ledger-report.repository';

export interface UsageQuery {
  from?: string;
  to?: string;
  groupBy?: string;
}

export type UsageTotals = Omit<UsageRow, 'key'>;

export interface UsageReport {
  from: Date;
  to: Date;
  groupBy: UsageGroup;
  rows: UsageRow[];
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

    const to = query.to === undefined ? now : parseInstant('to', query.to);
    const from = query.from === undefined ? new Date(to.getTime() - DEFAULT_USAGE_RANGE_DAYS * DAY_MS) : parseInstant('from', query.from);
    if (from.getTime() >= to.getTime()) return invalid('from', 'must be before to');
    if (to.getTime() - from.getTime() > MAX_USAGE_RANGE_DAYS * DAY_MS) return invalid('from', `the range cannot exceed ${MAX_USAGE_RANGE_DAYS} days`);

    const rows = await this.ledger.usage(groupBy, from, to);
    return { from, to, groupBy, rows, totals: sumRows(rows) };
  }
}
