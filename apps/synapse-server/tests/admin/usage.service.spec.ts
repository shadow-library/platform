import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

import { SERIES_GROUPS, USAGE_GROUPS } from '@modules/admin/admin.constants';
import { type SeriesRow, type UsageRow } from '@modules/admin/ledger-report.repository';
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
    expect(calls[0]).toEqual(['app', new Date(NOW.getTime() - 30 * DAY), NOW, {}]);
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

  it('should pass app and task filters to the ledger and omit absent ones', async () => {
    const { service, calls } = serviceOver();

    await service.report({ groupBy: 'day', app: 'novel-forge', task: 'chat.v2' }, NOW);
    await service.report({ task: 'chat' }, NOW);

    expect(calls[0]![3]).toEqual({ app: 'novel-forge', task: 'chat.v2' });
    expect(calls[1]![3]).toEqual({ task: 'chat' });
  });

  it('should reject malformed app and task filters', async () => {
    for (const value of ['', 'has space', 'a/b', 'x'.repeat(65), "a'; drop", 'é']) {
      const { service, calls } = serviceOver();

      await expectFailure(service.report({ app: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      await expectFailure(service.report({ task: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      await expectFailure(service.series({ app: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      await expectFailure(service.series({ task: value }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      expect(calls).toHaveLength(0);
    }
  });
});

function seriesRow(key: string | null, day: string, overrides: Partial<UsageRow> = {}): SeriesRow {
  return { ...row(key, overrides), day };
}

function seriesServiceOver(rows: SeriesRow[] = []): { service: UsageService; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const ledger = fakeLedger({
    usageSeries: async (...args: unknown[]) => {
      calls.push(args);
      return rows;
    },
  });
  return { service: new UsageService(ledger), calls };
}

describe('UsageService.series', () => {
  it('should accept every series groupBy and refuse day and unknown values', async () => {
    for (const groupBy of SERIES_GROUPS) {
      const { service, calls } = seriesServiceOver();

      await service.series({ groupBy }, NOW);

      expect(calls[0]![0]).toBe(groupBy);
    }
    for (const groupBy of ['day', '', 'APP', 'constructor']) {
      const { service, calls } = seriesServiceOver();

      await expectFailure(service.series({ groupBy }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
      expect(calls).toHaveLength(0);
    }
  });

  it('should default to app over the 30 days before now and forward filters', async () => {
    const { service, calls } = seriesServiceOver();

    const report = await service.series({ app: 'pulse' }, NOW);

    expect(report.groupBy).toBe('app');
    expect(calls[0]).toEqual(['app', new Date(NOW.getTime() - 30 * DAY), NOW, { app: 'pulse' }]);
  });

  it('should share the usage range rules', async () => {
    const { service, calls } = seriesServiceOver();

    await expectFailure(service.series({ from: '2026-10-05', to: '2026-10-05' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
    await expectFailure(service.series({ from: 'yesterday' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
    await expectFailure(service.series({ from: '2025-09-11', to: '2026-10-17' }, NOW), AppErrorCode.SYN_INVALID_REQUEST);
    expect(calls).toHaveLength(0);
    await service.series({ from: '2025-09-12', to: '2026-10-17' }, NOW);
    expect(calls).toHaveLength(1);
  });

  it('should list every UTC day touched by a range that starts and ends mid-day', async () => {
    const { service } = seriesServiceOver();

    const report = await service.series({ from: '2026-10-01T22:00:00Z', to: '2026-10-04T01:00:00Z' }, NOW);

    expect(report.days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('should leave out the end day when the range ends exactly at midnight, and use UTC for offsets', async () => {
    const { service } = seriesServiceOver();

    const aligned = await service.series({ from: '2026-10-01', to: '2026-10-03' }, NOW);
    const offset = await service.series({ from: '2026-10-01T01:00:00+02:00', to: '2026-10-01T23:00:00-02:00' }, NOW);
    const oneDay = await service.series({ from: '2026-10-01T05:00:00Z', to: '2026-10-01T06:00:00Z' }, NOW);

    expect(aligned.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(offset.days).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
    expect(oneDay.days).toEqual(['2026-10-01']);
  });

  it('should give every series one point per day, zero-filled', async () => {
    const { service } = seriesServiceOver([
      seriesRow('a', '2026-10-02', { calls: 3, listCostUsd: 0.3, billedCostUsd: 0.1 }),
      seriesRow('b', '2026-10-01', { calls: 2, listCostUsd: 0.2, billedCostUsd: 0 }),
      seriesRow('b', '2026-10-03', { calls: 1, listCostUsd: 0.1, billedCostUsd: 0.1 }),
    ]);

    const report = await service.series({ from: '2026-10-01', to: '2026-10-04' }, NOW);

    expect(report.series.map(entry => entry.points.map(point => point.day))).toEqual([report.days, report.days]);
    const a = report.series.find(entry => entry.key === 'a')!;
    expect(a.points).toEqual([
      { day: '2026-10-01', calls: 0, listCostUsd: 0, billedCostUsd: 0 },
      { day: '2026-10-02', calls: 3, listCostUsd: 0.3, billedCostUsd: 0.1 },
      { day: '2026-10-03', calls: 0, listCostUsd: 0, billedCostUsd: 0 },
    ]);
  });

  it('should return no series and zero totals for an empty range of data', async () => {
    const { service } = seriesServiceOver();

    const report = await service.series({ from: '2026-10-01', to: '2026-10-03' }, NOW);

    expect(report.series).toEqual([]);
    expect(report.totals.calls).toBe(0);
    expect(report.days).toHaveLength(2);
  });

  it('should total each series and the whole report without float drift', async () => {
    const { service } = seriesServiceOver([
      seriesRow('a', '2026-10-01', { listCostUsd: 0.1 }),
      seriesRow('a', '2026-10-02', { listCostUsd: 0.2 }),
      seriesRow(null, '2026-10-02', { listCostUsd: 0.3, calls: 4 }),
    ]);

    const report = await service.series({ from: '2026-10-01', to: '2026-10-03' }, NOW);

    expect(report.series.find(entry => entry.key === 'a')!.totals).toMatchObject({ calls: 2, listCostUsd: 0.3, billedCostUsd: 0.1 });
    expect(report.totals).toEqual({ calls: 6, inputTokens: 30, cachedInputTokens: 6, outputTokens: 15, reasoningTokens: 3, listCostUsd: 0.6, billedCostUsd: 0.15 });
  });

  it('should order series by list cost descending, then key ascending, with the null key last among ties', async () => {
    const day = '2026-10-01';
    const { service } = seriesServiceOver([
      seriesRow('zeta', day, { listCostUsd: 1 }),
      seriesRow(null, day, { listCostUsd: 1 }),
      seriesRow('alpha', day, { listCostUsd: 1 }),
      seriesRow('cheap', day, { listCostUsd: 0.5 }),
      seriesRow('top', day, { listCostUsd: 2 }),
    ]);

    const report = await service.series({ from: '2026-10-01', to: '2026-10-02' }, NOW);

    expect(report.series.map(entry => entry.key)).toEqual(['top', 'alpha', 'zeta', null, 'cheap']);
  });
});
