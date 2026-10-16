import { describe, expect, it } from 'bun:test';

import { ServerErrorCode } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import { AliasImpactService } from '@modules/admin/alias-impact.service';
import { type AliasUsageRow } from '@modules/admin/ledger-report.repository';
import { listCostUsd } from '@modules/catalog';

import { expectFailure, fakeCache, fakeLedger } from './admin.fixtures';

const NOW = new Date('2026-10-17T12:00:00Z');
const USAGE: AliasUsageRow[] = [
  { app: 'novel-forge', task: 'novel-forge.chat', calls: 10, inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 1_000_000 },
  { app: 'memoir', task: 'memoir.insight', calls: 2, inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 0 },
];

function serviceOver(usage: AliasUsageRow[] = USAGE): { service: AliasImpactService; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const ledger = fakeLedger({
    aliasUsage: async (...args: unknown[]) => {
      calls.push(args);
      return usage;
    },
  });
  return { service: new AliasImpactService(fakeCache(), ledger), calls };
}

describe('AliasImpactService', () => {
  it('should count the last 30 days by app and task', async () => {
    const { service, calls } = serviceOver();

    const impact = await service.impact('opus', undefined, NOW);

    expect(calls[0]).toEqual(['opus', new Date('2026-09-17T12:00:00Z')]);
    expect(impact).toMatchObject({ alias: 'opus', model: 'claude-opus-5.5', windowDays: 30, totalCalls: 12, rows: USAGE });
    expect(impact.retarget).toBeUndefined();
  });

  it('should price the retarget from the active catalog and the ledger token sums', async () => {
    const { service } = serviceOver();

    const impact = await service.impact('opus', 'grok-4.6', NOW);

    expect(impact.retarget).toEqual({ fromModel: 'claude-opus-5.5', toModel: 'grok-4.6', currentUsd: 28.25, proposedUsd: 8.2, deltaUsd: -20.05 });
    expect(impact.rows.map(row => row.deltaUsd)).toEqual([-19.75, -0.3]);
  });

  it('should price cached input at the cached rate and cap it at the input count', () => {
    const price = { input: 5, cachedInput: 0.5, output: 25 };

    expect(listCostUsd(price, { inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 1_000_000 })).toBe(27.75);
    expect(listCostUsd(price, { inputTokens: 1_000_000, cachedInputTokens: 9_000_000, outputTokens: 0 })).toBe(0.5);
    expect(listCostUsd({ input: 2, output: 6 }, { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 })).toBe(2);
  });

  it('should report a zero delta for a retarget to the current model', async () => {
    const { service } = serviceOver();

    const impact = await service.impact('opus', 'claude-opus-5.5', NOW);

    expect(impact.retarget?.deltaUsd).toBe(0);
  });

  it('should answer not found for an alias the active catalog lacks, even a prototype key', async () => {
    const { service, calls } = serviceOver();

    for (const key of ['missing', 'constructor', '__proto__']) await expectFailure(service.impact(key, undefined, NOW), ServerErrorCode.S009);
    expect(calls).toHaveLength(0);
  });

  it('should reject a retarget to a model the catalog lacks', async () => {
    const { service } = serviceOver();

    await expectFailure(service.impact('opus', 'missing', NOW), AppErrorCode.SYN_INVALID_REQUEST);
    await expectFailure(service.impact('opus', 'constructor', NOW), AppErrorCode.SYN_INVALID_REQUEST);
  });

  it('should answer an empty window with zero deltas', async () => {
    const { service } = serviceOver([]);

    const impact = await service.impact('opus', 'grok-4.6', NOW);

    expect(impact).toMatchObject({ totalCalls: 0, rows: [], retarget: { currentUsd: 0, proposedUsd: 0, deltaUsd: 0 } });
  });
});
