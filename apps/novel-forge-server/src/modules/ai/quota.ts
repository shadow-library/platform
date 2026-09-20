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

// Rows without a recorded `model_calls.cost_usd` (every chat/text call, and an image call whose
// provider response omitted `usage.cost`) fall back to token counts times the registry's
// per-million-token prices. Cached input tokens are billed at full input price here — an
// over-estimate that makes the ceiling conservative, which is the safe direction for a spend guard.
// A model the registry prices at nothing contributes nothing.
export function estimateCallCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const entry = MODEL_MAP[model];
  if (!entry) return 0;
  const inputPrice = entry.inputPricePerMToken ?? 0;
  const outputPrice = entry.outputPricePerMToken ?? 0;
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}

// Recorded cost is authoritative when the provider reported it (currently image calls only); the
// token-based estimate only ever covers rows that lack one, so a call is never counted twice.
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
