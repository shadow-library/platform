import { type AiRole, ROLE_GROUP } from '../../ai/defaults';
import { MODEL_MAP } from '../../ai/models';
import { estimateCallCostUsd } from '../../ai/quota';
import { type CostBreakdownItem, type CostResponse } from './project.dto';

export type CostWindow = 'last7Days' | 'last30Days' | 'older';

export interface CostUsageRow {
  role: string;
  model: string;
  window: CostWindow;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  recordedCostUsd: number;
  /** Tokens of the calls in this row that recorded no cost — the only ones the list-price estimate covers. */
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

type Accumulator = Map<string, CostBreakdownItem>;

const OTHER_GROUP = 'other';

// Roles outside the routing table are prompt keys (`bible:world`) or the telemetry fallback `unknown`;
// a namespaced key belongs to its namespace's group.
export function costGroupFor(role: string): string {
  const routed = ROLE_GROUP[role as AiRole] ?? ROLE_GROUP[role.split(':')[0] as AiRole];
  return routed ?? OTHER_GROUP;
}

function add(into: Accumulator, key: string, label: string, row: CostUsageRow, estimatedCostUsd: number): void {
  const item = into.get(key) ?? { key, label, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, estimatedCostUsd: 0 };
  item.calls += row.calls;
  item.inputTokens += row.inputTokens;
  item.outputTokens += row.outputTokens;
  item.costUsd += row.recordedCostUsd + estimatedCostUsd;
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
  };

  for (const row of rows) {
    const estimatedCostUsd = estimateCallCostUsd(row.model, row.unpricedInputTokens, row.unpricedOutputTokens);
    const costUsd = row.recordedCostUsd + estimatedCostUsd;
    summary.totalCostUsd += costUsd;
    summary.estimatedCostUsd += estimatedCostUsd;
    if (row.window === 'last7Days') summary.last7DaysCostUsd += costUsd;
    if (row.window !== 'older') summary.last30DaysCostUsd += costUsd;
    summary.calls += row.calls;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;

    const group = costGroupFor(row.role);
    const entry = MODEL_MAP[row.model];
    add(groups, group, group, row, estimatedCostUsd);
    add(roles, row.role, row.role, row, estimatedCostUsd);
    add(models, row.model, entry && 'label' in entry ? entry.label : row.model, row, estimatedCostUsd);
  }

  return { ...summary, byGroup: bySpend(groups), byRole: bySpend(roles), byModel: bySpend(models) };
}
