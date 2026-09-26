import { describe, expect, it } from 'bun:test';

import { classifyRowCost, type CostClassifiableRow } from '@modules/ai/quota';

function row(overrides: Partial<CostClassifiableRow> = {}): CostClassifiableRow {
  return { model: 'anthropic/claude-sonnet-5', costSource: null, recordedCostUsd: 0, unpricedInputTokens: 0, unpricedOutputTokens: 0, ...overrides };
}

describe('classifyRowCost', () => {
  it('should treat a provider-priced row as real money with no estimated share', () => {
    const cost = classifyRowCost(row({ costSource: 'provider', recordedCostUsd: 0.02 }));

    expect(cost.costUsd).toBeCloseTo(0.02);
    expect(cost.estimatedCostUsd).toBe(0);
  });

  it("should count an 'estimate' row's recorded figure as its estimated share, unrecomputed", () => {
    const cost = classifyRowCost(row({ costSource: 'estimate', recordedCostUsd: 0.03 }));

    expect(cost.costUsd).toBeCloseTo(0.03);
    expect(cost.estimatedCostUsd).toBeCloseTo(0.03);
  });

  it('should price a legacy row (cost_source null) from its unpriced tokens only', () => {
    const cost = classifyRowCost(row({ costSource: null, recordedCostUsd: 0.01, unpricedInputTokens: 1_000_000 }));

    expect(cost.estimatedCostUsd).toBeGreaterThan(0);
    expect(cost.costUsd).toBeCloseTo(0.01 + cost.estimatedCostUsd);
  });

  it('should price an unregistered model as zero rather than throwing', () => {
    const cost = classifyRowCost(row({ model: 'no-such-model', unpricedInputTokens: 1_000_000 }));

    expect(cost.costUsd).toBe(0);
    expect(cost.estimatedCostUsd).toBe(0);
  });
});
