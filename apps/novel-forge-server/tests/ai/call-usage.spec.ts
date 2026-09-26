import { describe, expect, it } from 'bun:test';

import { emptyCallUsageTotals, summarizeCallUsage, type UsageCallRow } from '@modules/ai/usage/call-usage';

function call(overrides: Partial<UsageCallRow> = {}): UsageCallRow {
  return {
    model: 'anthropic/claude-sonnet-5',
    status: 'ok',
    costSource: 'provider',
    costUsd: '0.01',
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 50,
    latencyMs: 500,
    ...overrides,
  };
}

describe('summarizeCallUsage', () => {
  it('should return zeroed totals for no calls', () => {
    expect(summarizeCallUsage([])).toEqual(emptyCallUsageTotals());
  });

  it('should sum tokens and cost across calls', () => {
    const totals = summarizeCallUsage([call({ costUsd: '0.01' }), call({ costUsd: '0.02', inputTokens: 200, outputTokens: 80 })]);

    expect(totals.calls).toBe(2);
    expect(totals.inputTokens).toBe(300);
    expect(totals.cachedInputTokens).toBe(40);
    expect(totals.outputTokens).toBe(130);
    expect(totals.costUsd).toBeCloseTo(0.03);
    expect(totals.estimatedCostUsd).toBe(0);
  });

  it("should count an 'estimate' call's frozen cost as its estimated share without recomputing it", () => {
    const totals = summarizeCallUsage([call({ costSource: 'estimate', costUsd: '0.005' })]);

    expect(totals.costUsd).toBeCloseTo(0.005);
    expect(totals.estimatedCostUsd).toBeCloseTo(0.005);
  });

  it('should price a legacy call (no cost_source, no recorded cost) from its own tokens', () => {
    const totals = summarizeCallUsage([call({ costSource: null, costUsd: null, inputTokens: 1_000_000, outputTokens: 0 })]);

    expect(totals.estimatedCostUsd).toBeGreaterThan(0);
    expect(totals.costUsd).toBeCloseTo(totals.estimatedCostUsd);
  });

  it("should key an errored call as 'error' rather than blending it into a cost-source bucket", () => {
    const totals = summarizeCallUsage([
      call({ status: 'transport_error', costSource: null, costUsd: null, inputTokens: 0, outputTokens: 0 }),
      call({ costSource: 'gateway', costUsd: '0.02' }),
    ]);

    expect(totals.byCostSource.map(item => item.costSource).sort()).toEqual(['error', 'gateway']);
  });

  it("should group a call with no cost_source under 'unknown'", () => {
    const totals = summarizeCallUsage([call({ costSource: null, costUsd: '0.01' })]);

    expect(totals.byCostSource.map(item => item.costSource)).toEqual(['unknown']);
  });

  it('should sort byCostSource by highest spend first', () => {
    const totals = summarizeCallUsage([call({ costSource: 'provider', costUsd: '0.01' }), call({ costSource: 'gateway', costUsd: '0.05' })]);

    expect(totals.byCostSource.map(item => item.costSource)).toEqual(['gateway', 'provider']);
  });

  it('should sum latency across calls', () => {
    const totals = summarizeCallUsage([call({ latencyMs: 100 }), call({ latencyMs: 250 }), call({ latencyMs: null })]);

    expect(totals.totalLatencyMs).toBe(350);
  });
});
