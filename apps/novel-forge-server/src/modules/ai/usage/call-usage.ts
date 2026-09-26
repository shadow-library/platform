import { type Ai } from '@server/database';

import { classifyRowCost } from '../quota';

export interface UsageCallRow {
  model: string;
  status: Ai.ModelCallStatus;
  costSource: Ai.CostSource | null;
  costUsd: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
}

/** One `GROUP BY run_id/job_id/…, model, cost_source, status` bucket — `classifyRowCost` prices a legacy (unclassified) bucket from its own model, same as a raw row. */
export interface GroupedUsageRow {
  model: string;
  status: Ai.ModelCallStatus;
  costSource: Ai.CostSource | null;
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  recordedCostUsd: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

export interface CostSourceUsage {
  costSource: string;
  calls: number;
  costUsd: number;
}

export interface CallUsageTotals {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  estimatedCostUsd: number;
  totalLatencyMs: number;
  byCostSource: CostSourceUsage[];
}

const ERROR_KEY = 'error';
const UNKNOWN_KEY = 'unknown';

export function emptyCallUsageTotals(): CallUsageTotals {
  return { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, estimatedCostUsd: 0, totalLatencyMs: 0, byCostSource: [] };
}

interface FoldableUsage {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: Ai.ModelCallStatus;
  costSource: Ai.CostSource | null;
  costUsd: number;
  estimatedCostUsd: number;
}

function fold(totals: CallUsageTotals, bySource: Map<string, CostSourceUsage>, row: FoldableUsage): void {
  totals.calls += row.calls;
  totals.inputTokens += row.inputTokens;
  totals.cachedInputTokens += row.cachedInputTokens;
  totals.outputTokens += row.outputTokens;
  totals.costUsd += row.costUsd;
  totals.estimatedCostUsd += row.estimatedCostUsd;
  totals.totalLatencyMs += row.latencyMs;

  // An errored call never gets classified — it recorded no cost at all — so it would otherwise blend into 'unknown'.
  const key = row.status === 'ok' ? (row.costSource ?? UNKNOWN_KEY) : ERROR_KEY;
  const entry = bySource.get(key) ?? { costSource: key, calls: 0, costUsd: 0 };
  entry.calls += row.calls;
  entry.costUsd += row.costUsd;
  bySource.set(key, entry);
}

function bySpend(bySource: Map<string, CostSourceUsage>): CostSourceUsage[] {
  return [...bySource.values()].sort((a, b) => b.costUsd - a.costUsd);
}

/** Totals a raw (ungrouped) list of `model_calls` rows — for aggregations small enough to read every row (one run, chapter or job's calls). */
export function summarizeCallUsage(calls: readonly UsageCallRow[]): CallUsageTotals {
  const totals = emptyCallUsageTotals();
  const bySource = new Map<string, CostSourceUsage>();

  for (const call of calls) {
    const recordedCostUsd = call.costUsd != null ? Number(call.costUsd) : 0;
    const unpriced = call.costUsd == null;
    const { costUsd, estimatedCostUsd } = classifyRowCost({
      model: call.model,
      costSource: call.costSource,
      recordedCostUsd,
      unpricedInputTokens: unpriced ? (call.inputTokens ?? 0) : 0,
      unpricedOutputTokens: unpriced ? (call.outputTokens ?? 0) : 0,
    });
    fold(totals, bySource, {
      calls: 1,
      inputTokens: call.inputTokens ?? 0,
      cachedInputTokens: call.cachedInputTokens ?? 0,
      outputTokens: call.outputTokens ?? 0,
      latencyMs: call.latencyMs ?? 0,
      status: call.status,
      costSource: call.costSource,
      costUsd,
      estimatedCostUsd,
    });
  }

  totals.byCostSource = bySpend(bySource);
  return totals;
}

/** Totals a SQL-grouped list of `model_calls` buckets — for a list of runs or jobs, where reading every underlying row would not scale. */
export function summarizeGroupedCallUsage(rows: readonly GroupedUsageRow[]): CallUsageTotals {
  const totals = emptyCallUsageTotals();
  const bySource = new Map<string, CostSourceUsage>();

  for (const row of rows) {
    const { costUsd, estimatedCostUsd } = classifyRowCost(row);
    fold(totals, bySource, { ...row, costUsd, estimatedCostUsd });
  }

  totals.byCostSource = bySpend(bySource);
  return totals;
}
