import { describe, expect, it } from 'bun:test';

import { type CostUsageRow, summarizeCost } from '@modules/project/project/project-cost';

function row(overrides: Partial<CostUsageRow> = {}): CostUsageRow {
  return {
    role: 'judge',
    model: 'anthropic/claude-sonnet-5',
    window: 'last7Days',
    status: 'ok',
    costSource: null,
    tier: null,
    contentMode: null,
    calls: 1,
    inputTokens: 100,
    outputTokens: 50,
    recordedCostUsd: 0,
    unpricedInputTokens: 0,
    unpricedOutputTokens: 0,
    ...overrides,
  };
}

describe('summarizeCost', () => {
  it('should sum a provider-priced row as real money with no estimated share', () => {
    const summary = summarizeCost([row({ costSource: 'provider', recordedCostUsd: 0.01 })]);

    expect(summary.totalCostUsd).toBeCloseTo(0.01);
    expect(summary.estimatedCostUsd).toBe(0);
  });

  it("should count an 'estimate' row's frozen cost_usd as its estimated share without recomputing it", () => {
    const summary = summarizeCost([row({ costSource: 'estimate', recordedCostUsd: 0.005 })]);

    expect(summary.totalCostUsd).toBeCloseTo(0.005);
    expect(summary.estimatedCostUsd).toBeCloseTo(0.005);
  });

  it('should still price a legacy pre-classification row (cost_source null) from its unpriced tokens', () => {
    const summary = summarizeCost([row({ costSource: null, recordedCostUsd: 0, unpricedInputTokens: 1_000_000, unpricedOutputTokens: 0 })]);

    expect(summary.estimatedCostUsd).toBeGreaterThan(0);
    expect(summary.totalCostUsd).toBeCloseTo(summary.estimatedCostUsd);
  });

  it('should sum every cost source into the total as real money', () => {
    const summary = summarizeCost([
      row({ costSource: 'provider', recordedCostUsd: 0.01 }),
      row({ costSource: 'gateway', recordedCostUsd: 0.02 }),
      row({ costSource: 'estimate', recordedCostUsd: 0.03 }),
    ]);

    expect(summary.totalCostUsd).toBeCloseTo(0.06);
    expect(summary.estimatedCostUsd).toBeCloseTo(0.03);
  });

  it('should break spend down by cost source, tier and content mode', () => {
    const summary = summarizeCost([
      row({ costSource: 'provider', tier: 'performant', contentMode: 'unrestricted', recordedCostUsd: 0.01 }),
      row({ costSource: 'gateway', tier: 'economy', contentMode: 'standard', recordedCostUsd: 0.02 }),
    ]);

    expect(summary.byCostSource.map(item => item.key).sort()).toEqual(['gateway', 'provider']);
    expect(summary.byTier.map(item => item.key).sort()).toEqual(['economy', 'performant']);
    expect(summary.byContentMode.map(item => item.key).sort()).toEqual(['standard', 'unrestricted']);
  });

  it("should group a row with no cost_source, tier or content_mode under 'unknown'", () => {
    const summary = summarizeCost([row()]);

    expect(summary.byCostSource.map(item => item.key)).toEqual(['unknown']);
    expect(summary.byTier.map(item => item.key)).toEqual(['unknown']);
    expect(summary.byContentMode.map(item => item.key)).toEqual(['unknown']);
  });

  it("should key an errored call as 'error' in byCostSource rather than blending it into 'unknown'", () => {
    const summary = summarizeCost([row({ status: 'transport_error', costSource: null, recordedCostUsd: 0 }), row({ status: 'ok', costSource: null })]);

    expect(summary.byCostSource.map(item => item.key).sort()).toEqual(['error', 'unknown']);
  });
});
