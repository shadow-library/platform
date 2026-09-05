import { MODEL_MAP } from './models';

export interface WindowUsageRow {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
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

// Chat calls never persist `model_calls.cost_usd` (only image calls do), so accumulated spend is
// reconstructed from recorded token counts and the registry's per-million-token prices. Cached input
// tokens are billed at full input price here — an over-estimate that makes the ceiling conservative,
// which is the safe direction for a spend guard. Ollama and any unpriced model contribute nothing.
export function estimateCallCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const entry = MODEL_MAP[model];
  if (!entry) return 0;
  const inputPrice = entry.inputPricePerMToken ?? 0;
  const outputPrice = entry.outputPricePerMToken ?? 0;
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}

export function computeWindowUsage(rows: WindowUsageRow[]): WindowUsage {
  let calls = 0;
  let costUsd = 0;
  for (const row of rows) {
    calls += row.calls;
    costUsd += estimateCallCostUsd(row.model, row.inputTokens, row.outputTokens);
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
