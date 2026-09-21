import { MODEL_MAP } from './models';

export interface WindowUsageRow {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of `model_calls.cost_usd` for rows in this group that recorded a real cost — kept separate from `inputTokens`/`outputTokens`, which are summed only over rows without a recorded cost, so the two never double-count the same call. */
  recordedCostUsd: number;
}

export interface WindowUsage {
  calls: number;
  costUsd: number;
}

export interface AiQuotaLimits {
  maxCalls: number;
  maxCostUsd: number;
}

export type QuotaBreach = 'rate' | 'spend' | null;

// This same estimate serves two callers: `TelemetryHandler` calls it at write time to fill
// `model_calls.cost_usd` for a text call whose provider reported no cost, and `computeWindowUsage`
// below calls it at query time for whatever rows still carry no recorded cost at all (older rows
// written before cost tracking existed, or an image call whose provider response omitted `usage.cost`).
// A row's cost is frozen the moment it is written — a later change to these prices never re-prices a
// row that already recorded one, deliberately, so historical spend stays comparable across price
// changes. Cached input tokens are billed at full input price here — an over-estimate that makes the
// ceiling conservative, which is the safe direction for a spend guard. A model the registry prices at
// nothing contributes nothing.
export function estimateCallCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const entry = MODEL_MAP[model];
  if (!entry) return 0;
  const inputPrice = entry.inputPricePerMToken ?? 0;
  const outputPrice = entry.outputPricePerMToken ?? 0;
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}

// A row's `recordedCostUsd` (provider-reported or frozen-at-write-time estimate, for any call kind)
// is authoritative over recomputing it here; the token-based estimate only ever covers rows that
// still carry no recorded cost, so a call is never counted twice.
export function computeWindowUsage(rows: WindowUsageRow[]): WindowUsage {
  let calls = 0;
  let costUsd = 0;
  for (const row of rows) {
    calls += row.calls;
    costUsd += row.recordedCostUsd + estimateCallCostUsd(row.model, row.inputTokens, row.outputTokens);
  }
  return { calls, costUsd };
}

// A non-positive limit disables that dimension. The comparison is `>=` because `usage` counts the calls
// already made in the window: at the limit, the next dispatch is the one over the line.
export function quotaBreach(usage: WindowUsage, limits: AiQuotaLimits): QuotaBreach {
  if (limits.maxCalls > 0 && usage.calls >= limits.maxCalls) return 'rate';
  if (limits.maxCostUsd > 0 && usage.costUsd >= limits.maxCostUsd) return 'spend';
  return null;
}
