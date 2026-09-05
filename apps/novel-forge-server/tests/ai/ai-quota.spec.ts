import { afterEach, describe, expect, it } from 'bun:test';

import { AiQuotaService } from '@modules/ai/ai-quota.service';
import { computeWindowUsage, estimateCallCostUsd, quotaBreach, type WindowUsageRow } from '@modules/ai/quota';
import { type AppError, Config } from '@shadow-library/common';

function setConfig(key: string, value: unknown): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].set(key, value);
}

function clearConfig(key: string): void {
  (Config as unknown as { cache: Map<string, unknown> })['cache'].delete(key);
}

describe('estimateCallCostUsd', () => {
  it('should price a known model from its registry per-million-token rates', () => {
    // claude-sonnet-5: $2/M input, $10/M output.
    expect(estimateCallCostUsd('anthropic/claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
  });

  it('should charge nothing for an unpriced local model or an unknown model id', () => {
    expect(estimateCallCostUsd('qwen3:14b', 5_000_000, 5_000_000)).toBe(0);
    expect(estimateCallCostUsd('who/knows', 5_000_000, 5_000_000)).toBe(0);
  });
});

describe('computeWindowUsage', () => {
  it('should sum calls across models and accumulate priced spend', () => {
    const rows: WindowUsageRow[] = [
      { model: 'anthropic/claude-sonnet-5', calls: 3, inputTokens: 1_000_000, outputTokens: 500_000 },
      { model: 'qwen3:14b', calls: 4, inputTokens: 2_000_000, outputTokens: 2_000_000 },
    ];
    const usage = computeWindowUsage(rows);
    expect(usage.calls).toBe(7);
    // 1M×$2 + 0.5M×$10 = $7 from the hosted model; the local model is free.
    expect(usage.costUsd).toBeCloseTo(7, 6);
  });

  it('should report zero usage for an empty window', () => {
    expect(computeWindowUsage([])).toEqual({ calls: 0, costUsd: 0 });
  });
});

describe('quotaBreach', () => {
  it('should breach the rate limit exactly at the call ceiling, not one below it', () => {
    expect(quotaBreach({ calls: 999, costUsd: 0 }, { maxCalls: 1000, maxCostUsd: 0 })).toBeNull();
    expect(quotaBreach({ calls: 1000, costUsd: 0 }, { maxCalls: 1000, maxCostUsd: 0 })).toBe('rate');
  });

  it('should breach the spend limit exactly at the cost ceiling, not one below it', () => {
    expect(quotaBreach({ calls: 0, costUsd: 49.99 }, { maxCalls: 0, maxCostUsd: 50 })).toBeNull();
    expect(quotaBreach({ calls: 0, costUsd: 50 }, { maxCalls: 0, maxCostUsd: 50 })).toBe('spend');
  });

  it('should treat a non-positive limit as disabled', () => {
    expect(quotaBreach({ calls: 9_999, costUsd: 9_999 }, { maxCalls: 0, maxCostUsd: 0 })).toBeNull();
  });

  it('should report the rate breach before the spend breach when both are exceeded', () => {
    expect(quotaBreach({ calls: 5000, costUsd: 5000 }, { maxCalls: 1000, maxCostUsd: 50 })).toBe('rate');
  });
});

describe('AiQuotaService.enforce', () => {
  const service = new AiQuotaService({ getPostgresClient: () => ({}) } as never);
  const setUsage = (rows: WindowUsageRow[]): void => {
    (service as unknown as Record<string, unknown>)['readWindowUsage'] = async () => rows;
  };

  afterEach(() => {
    clearConfig('ai.quota.max-calls');
    clearConfig('ai.quota.max-cost-usd');
    clearConfig('ai.quota.window-ms');
  });

  it('should pass when window usage is under both ceilings', async () => {
    setConfig('ai.quota.max-calls', 1000);
    setConfig('ai.quota.max-cost-usd', 50);
    setUsage([{ model: 'anthropic/claude-sonnet-5', calls: 10, inputTokens: 1000, outputTokens: 1000 }]);
    await service.enforce(BigInt(1));
  });

  it('should throw AI_008 once the dispatch count reaches the ceiling', async () => {
    setConfig('ai.quota.max-calls', 5);
    setConfig('ai.quota.max-cost-usd', 0);
    setUsage([{ model: 'qwen3:14b', calls: 5, inputTokens: 0, outputTokens: 0 }]);
    const err = (await service.enforce(BigInt(1)).catch((e: AppError) => e)) as AppError;
    expect(err.code).toBe('AI_008');
    expect(err.status).toBe(429);
  });

  it('should throw AI_009 once accumulated spend reaches the ceiling', async () => {
    setConfig('ai.quota.max-calls', 0);
    setConfig('ai.quota.max-cost-usd', 5);
    setUsage([{ model: 'anthropic/claude-sonnet-5', calls: 1, inputTokens: 3_000_000, outputTokens: 0 }]);
    const err = (await service.enforce(BigInt(1)).catch((e: AppError) => e)) as AppError;
    expect(err.code).toBe('AI_009');
  });

  it('should skip the usage read entirely when both limits are disabled', async () => {
    setConfig('ai.quota.max-calls', 0);
    setConfig('ai.quota.max-cost-usd', 0);
    (service as unknown as Record<string, unknown>)['readWindowUsage'] = async () => {
      throw new Error('readWindowUsage must not run when the quota is disabled');
    };
    await service.enforce(BigInt(1));
  });

  it('should fail open when the usage read throws', async () => {
    setConfig('ai.quota.max-calls', 1);
    setConfig('ai.quota.max-cost-usd', 1);
    (service as unknown as Record<string, unknown>)['readWindowUsage'] = async () => {
      throw new Error('database unavailable');
    };
    await service.enforce(BigInt(1));
  });
});
