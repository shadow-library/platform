import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

import { USAGE_GROUPS } from '@modules/admin/admin.constants';
import { type UsageRow } from '@modules/admin/ledger-report.repository';
import { UsageService } from '@modules/admin/usage.service';

import { expectFailure, fakeLedger } from './admin.fixtures';

const NOW = new Date('2026-10-17T12:00:00Z');
const DAY = 86_400_000;

function row(key: string | null, overrides: Partial<UsageRow> = {}): UsageRow {
  return { key, calls: 1, inputTokens: 10, cachedInputTokens: 2, outputTokens: 5, reasoningTokens: 1, listCostUsd: 0.1, billedCostUsd: 0.05, ...overrides };
}

function serviceOver(rows: UsageRow[] = []): { service: UsageService; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const ledger = fakeLedger({
    usage: async (...args: unknown[]) => {
      calls.push(args);
      return rows;
    },
  });
  return { service: new UsageService(ledger), calls };
}

describe('UsageService', () => {
  it('should accept every documented groupBy and pass it to the ledger', async () => {
    for (const groupBy of USAGE_GROUPS) {
      const { service, calls } = serviceOver();

      await service.report({ groupBy }, NOW);

      expect(calls[0]![0]).toBe(groupBy);
    }
  });

  it('should reject an unknown groupBy, including prototype keys and case variants', async () => {
    for (const groupBy of ['', 'user', 'APP', 'constructor', '__proto__', 'app,task']) {
      const { service, calls } = serviceOver();

      await expectFailure(service.report({ groupBy }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      expect(calls).toHaveLength(0);
    }
  });

  it('should default to grouping by app over the 30 days before now', async () => {
    const { service, calls } = serviceOver();

    const report = await service.report({}, NOW);

    expect(report.groupBy).toBe('app');
    expect(calls[0]).toEqual(['app', new Date(NOW.getTime() - 30 * DAY), NOW]);
  });

  it('should read a bare date as UTC midnight and a date-time with its offset', async () => {
    const { service } = serviceOver();

    const report = await service.report({ from: '2026-10-01', to: '2026-10-05T10:00:00+02:00' }, NOW);

    expect(report.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(report.to.toISOString()).toBe('2026-10-05T08:00:00.000Z');
  });

  it('should reject unparseable, impossible and zoneless instants', async () => {
    for (const value of ['yesterday', '2026-02-31', '2026-02-30T00:00:00Z', '2026-04-31T10:00:00+02:00', '2026-13-01', '2026-10-01T10:00', '2026-10-01 10:00Z', '1760000000', '']) {
      const { service } = serviceOver();

      await expectFailure(service.report({ from: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      await expectFailure(service.report({ to: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
    }
  });

  it('should reject an empty or reversed range', async () => {
    const { service } = serviceOver();

    await expectFailure(service.report({ from: '2026-10-05', to: '2026-10-05' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
    await expectFailure(service.report({ from: '2026-10-06', to: '2026-10-05' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
  });

  it('should bound the range to 400 days', async () => {
    const { service } = serviceOver();

    await service.report({ from: '2025-09-12', to: '2026-10-17' }, NOW);
    await expectFailure(service.report({ from: '2025-09-11', to: '2026-10-17' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
  });

  it('should total the rows without float drift in the cost', async () => {
    const { service } = serviceOver([row('a', { listCostUsd: 0.1 }), row('b', { listCostUsd: 0.2, calls: 4 }), row(null, { listCostUsd: 0.3 })]);

    const { totals, rows } = await service.report({ groupBy: 'alias' }, NOW);

    expect(rows).toHaveLength(3);
    expect(totals).toEqual({ calls: 6, inputTokens: 30, cachedInputTokens: 6, outputTokens: 15, reasoningTokens: 3, listCostUsd: 0.6, billedCostUsd: 0.15 });
  });
});
