import { type SynapseCost } from '@shadow-library/synapse';

import { type Ai } from '@server/database';

import { HISTORICAL_MODELS } from './historical-models';

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

// Prices only rows that recorded no cost: one written before cost tracking, or an image call whose provider reported none. A row's cost is frozen
// when it is written, so historical spend stays comparable. Cached input is billed at the full input price, an over-estimate. A model with no
// historical price contributes nothing.
export function estimateCallCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const entry = HISTORICAL_MODELS[model];
  if (!entry) return 0;
  const inputPrice = entry.inputPricePerMToken ?? 0;
  const outputPrice = entry.outputPricePerMToken ?? 0;
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}

/** A Synapse call's list price is its cost; something billed means the provider charged it, a free call at a list price was the CLI gateway's. */
export function classifySynapseCostSource(cost: SynapseCost): Ai.CostSource {
  if (cost.billed_usd > 0) return 'provider';
  if (cost.list_usd > 0) return 'gateway';
  return 'estimate';
}

export interface CostClassifiableRow {
  model: string;
  /** Null on a row written before `cost_source` existed, or on any row this classification does not cover. */
  costSource: Ai.CostSource | null;
  /** Sum of `cost_usd` for the rows this figure aggregates that recorded a cost. */
  recordedCostUsd: number;
  /** Tokens of the aggregated rows that recorded no cost at all — the only share a legacy estimate must still cover. */
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

export interface ClassifiedCost {
  /** Recorded cost plus the list-price estimate for the share that recorded none. */
  costUsd: number;
  /** The part of `costUsd` estimated from historical list prices rather than recorded by the provider or gateway. */
  estimatedCostUsd: number;
}

// Shared by every cost aggregation so a pre-classification row is priced identically everywhere: an `estimate` row's list price is frozen into `recordedCostUsd` at write time.
// Only a row with no `cost_source` still needs a fresh estimate, for its unpriced share.
export function classifyRowCost(row: CostClassifiableRow): ClassifiedCost {
  const legacyEstimate = row.costSource === null ? estimateCallCostUsd(row.model, row.unpricedInputTokens, row.unpricedOutputTokens) : 0;
  const estimatedCostUsd = row.costSource === 'estimate' ? row.recordedCostUsd : legacyEstimate;
  const costUsd = row.recordedCostUsd + legacyEstimate;
  return { costUsd, estimatedCostUsd };
}

// `recordedCostUsd` is authoritative; the token-based estimate covers only rows with no recorded cost, so a call is never counted twice.
export function computeWindowUsage(rows: WindowUsageRow[]): WindowUsage {
  let calls = 0;
  let costUsd = 0;
  for (const row of rows) {
    calls += row.calls;
    costUsd += row.recordedCostUsd + estimateCallCostUsd(row.model, row.inputTokens, row.outputTokens);
  }
  return { calls, costUsd };
}
