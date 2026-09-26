import { type Ai } from '@server/database';

import { MODEL_MAP } from './models';

export interface GatewayInfo {
  servedBy?: string;
  servedModel?: string;
  openrouter: boolean;
}

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

// Labels where a reported cost came from; the owner's decision is that every source is shown as the real charge regardless.
export function classifyCostSource(providerCostUsd: number | undefined, gateway: GatewayInfo | undefined): Ai.CostSource {
  if (providerCostUsd === undefined) return 'estimate';
  if (!gateway || gateway.openrouter) return 'provider';
  return 'gateway';
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
  /** The part of `costUsd` estimated from registry list prices rather than recorded by the provider or gateway. */
  estimatedCostUsd: number;
}

// Shared by every cost aggregation (project, chapter, run, job, chat turn, account) so a legacy
// pre-classification row is priced identically everywhere: a row already classified `estimate` has its
// list-price estimate frozen into `recordedCostUsd` at write time — recomputing it here would drift from
// the recorded figure whenever registry prices change since. Only a row with no `cost_source` at all still
// needs a fresh estimate, and only for the unpriced share left uncounted.
export function classifyRowCost(row: CostClassifiableRow): ClassifiedCost {
  const legacyEstimate = row.costSource === null ? estimateCallCostUsd(row.model, row.unpricedInputTokens, row.unpricedOutputTokens) : 0;
  const estimatedCostUsd = row.costSource === 'estimate' ? row.recordedCostUsd : legacyEstimate;
  const costUsd = row.recordedCostUsd + legacyEstimate;
  return { costUsd, estimatedCostUsd };
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
