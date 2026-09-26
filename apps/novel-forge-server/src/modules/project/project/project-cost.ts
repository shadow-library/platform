import { type Ai, type Project } from '@server/database';

import { type AiRole, ROLE_GROUP } from '../../ai/defaults';
import { MODEL_MAP } from '../../ai/models';
import { estimateCallCostUsd } from '../../ai/quota';
import { type CostBreakdownItem, type CostResponse } from './project.dto';

export type CostWindow = 'last7Days' | 'last30Days' | 'older';

export interface CostUsageRow {
  role: string;
  model: string;
  window: CostWindow;
  status: Ai.ModelCallStatus;
  /** Null on a row written before `cost_source` existed. */
  costSource: Ai.CostSource | null;
  tier: Project.CostTier | null;
  contentMode: Project.ContentMode | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  recordedCostUsd: number;
  /** Tokens of calls with no `cost_source` that also recorded no cost — the legacy pre-classification rows the list-price estimate still covers. */
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

type Accumulator = Map<string, CostBreakdownItem>;

const OTHER_GROUP = 'other';
const UNKNOWN_KEY = 'unknown';
const ERROR_KEY = 'error';

// Roles outside the routing table are prompt keys (`bible:world`) or the telemetry fallback `unknown`;
// a namespaced key belongs to its namespace's group.
export function costGroupFor(role: string): string {
  const routed = ROLE_GROUP[role as AiRole] ?? ROLE_GROUP[role.split(':')[0] as AiRole];
  return routed ?? OTHER_GROUP;
}

function add(into: Accumulator, key: string, label: string, row: CostUsageRow, costUsd: number, estimatedCostUsd: number): void {
  const item = into.get(key) ?? { key, label, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, estimatedCostUsd: 0 };
  item.calls += row.calls;
  item.inputTokens += row.inputTokens;
  item.outputTokens += row.outputTokens;
  item.costUsd += costUsd;
  item.estimatedCostUsd += estimatedCostUsd;
  into.set(key, item);
}

function bySpend(items: Accumulator): CostBreakdownItem[] {
  return [...items.values()].sort((a, b) => b.costUsd - a.costUsd || b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens));
}

export function summarizeCost(rows: readonly CostUsageRow[]): CostResponse {
  const groups: Accumulator = new Map();
  const roles: Accumulator = new Map();
  const models: Accumulator = new Map();
  const costSources: Accumulator = new Map();
  const tiers: Accumulator = new Map();
  const contentModes: Accumulator = new Map();
  const summary: CostResponse = {
    totalCostUsd: 0,
    estimatedCostUsd: 0,
    last7DaysCostUsd: 0,
    last30DaysCostUsd: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    byGroup: [],
    byRole: [],
    byModel: [],
    byCostSource: [],
    byTier: [],
    byContentMode: [],
  };

  for (const row of rows) {
    // A row already classified `estimate` has its list-price estimate frozen into `cost_usd` at write time —
    // recomputing it here would drift from the recorded figure whenever registry prices change since. Only a
    // row with no `cost_source` at all (written before this classification existed) still needs a fresh
    // estimate, and only for the unpriced share `cost_usd IS NULL` left uncounted.
    const legacyEstimate = row.costSource === null ? estimateCallCostUsd(row.model, row.unpricedInputTokens, row.unpricedOutputTokens) : 0;
    const estimatedPortion = row.costSource === 'estimate' ? row.recordedCostUsd : legacyEstimate;
    const costUsd = row.recordedCostUsd + legacyEstimate;

    summary.totalCostUsd += costUsd;
    summary.estimatedCostUsd += estimatedPortion;
    if (row.window === 'last7Days') summary.last7DaysCostUsd += costUsd;
    if (row.window !== 'older') summary.last30DaysCostUsd += costUsd;
    summary.calls += row.calls;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;

    const group = costGroupFor(row.role);
    const entry = MODEL_MAP[row.model];
    add(groups, group, group, row, costUsd, estimatedPortion);
    add(roles, row.role, row.role, row, costUsd, estimatedPortion);
    add(models, row.model, entry && 'label' in entry ? entry.label : row.model, row, costUsd, estimatedPortion);
    // An errored call never gets classified — it recorded no cost at all — so it would otherwise blend into
    // the same 'unknown' bucket as a legitimate pre-classification row; keying it separately keeps that bucket honest.
    const costSourceKey = row.status === 'ok' ? (row.costSource ?? UNKNOWN_KEY) : ERROR_KEY;
    add(costSources, costSourceKey, costSourceKey, row, costUsd, estimatedPortion);
    add(tiers, row.tier ?? UNKNOWN_KEY, row.tier ?? UNKNOWN_KEY, row, costUsd, estimatedPortion);
    add(contentModes, row.contentMode ?? UNKNOWN_KEY, row.contentMode ?? UNKNOWN_KEY, row, costUsd, estimatedPortion);
  }

  return {
    ...summary,
    byGroup: bySpend(groups),
    byRole: bySpend(roles),
    byModel: bySpend(models),
    byCostSource: bySpend(costSources),
    byTier: bySpend(tiers),
    byContentMode: bySpend(contentModes),
  };
}
