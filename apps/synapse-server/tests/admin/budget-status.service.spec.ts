import { describe, expect, it } from 'bun:test';

import { AppErrorCode } from '@server/classes';

import { BudgetStatusService } from '@modules/admin/budget-status.service';
import { type SubjectCountersQuery, type SubjectCountersSummary } from '@modules/admin/ledger-report.repository';
import { type ActiveCatalogCache, type BudgetSpec } from '@modules/catalog';
import { type BudgetCounterKey, type BudgetCounterReading } from '@modules/metering';

import { catalogDocument } from '../catalog/catalog.fixtures';
import { expectFailure, fakeCache, fakeLedger } from './admin.fixtures';

const NOW = new Date('2026-10-17T13:47:12.345Z');
const HOUR_START = new Date('2026-10-17T13:00:00.000Z');
const EMPTY: SubjectCountersSummary = { activeSubjects: 0, atLimit: 0, top: [] };

interface Answers {
  counter?: BudgetCounterReading;
  summary?: SubjectCountersSummary;
}

function serviceOver(budgets: BudgetSpec[], answers: Answers = {}) {
  const counterReads: BudgetCounterKey[] = [];
  const subjectReads: SubjectCountersQuery[] = [];
  const ledger = fakeLedger({
    budgetCounter: async (key: BudgetCounterKey) => {
      counterReads.push(key);
      return answers.counter;
    },
    subjectCounters: async (query: SubjectCountersQuery) => {
      subjectReads.push(query);
      return answers.summary ?? EMPTY;
    },
  });
  const service = new BudgetStatusService(
    fakeCache(
      catalogDocument(document => void (document.budgets = budgets)),
      7,
    ),
    ledger,
  );
  return { service, counterReads, subjectReads };
}

describe('BudgetStatusService', () => {
  it('should refuse when no catalog is active, as every admin view does', async () => {
    const cache = { requireCurrent: () => AppErrorCode.SYN_NO_ACTIVE_CATALOG.throw() } as unknown as ActiveCatalogCache;
    await expectFailure(new BudgetStatusService(cache, fakeLedger()).status(NOW), AppErrorCode.SYN_NO_ACTIVE_CATALOG);
  });

  it('should report no budgets without reading any counter', async () => {
    const { service, counterReads, subjectReads } = serviceOver([]);

    expect(await service.status(NOW)).toEqual({ catalogVersion: 7, budgets: [] });
    expect(counterReads).toHaveLength(0);
    expect(subjectReads).toHaveLength(0);
  });

  it('should read a per-app budget from the app counter of the current window', async () => {
    const { service, counterReads } = serviceOver([{ app: 'memoir', per: 'app', window: '1d', maxListCostUsd: 20 }], { counter: { calls: 41, listCostUsd: 12.5 } });

    const [status] = (await service.status(NOW)).budgets;

    expect(counterReads).toEqual([{ app: 'memoir', subjectType: 'app', subjectId: 'memoir', window: '1d', windowStart: new Date('2026-10-17T00:00:00.000Z') }]);
    expect(status).toEqual({
      index: 0,
      app: 'memoir',
      per: 'app',
      window: '1d',
      maxListCostUsd: 20,
      windowStart: new Date('2026-10-17T00:00:00.000Z'),
      windowEnd: new Date('2026-10-18T00:00:00.000Z'),
      usage: { kind: 'app', calls: 41, listCostUsd: 12.5 },
    });
  });

  it('should report zero usage for a per-app budget whose window has no counter yet', async () => {
    const { service } = serviceOver([{ app: 'memoir', per: 'app', window: '1h', maxCalls: 100 }]);

    expect((await service.status(NOW)).budgets[0]?.usage).toEqual({ kind: 'app', calls: 0, listCostUsd: 0 });
  });

  it('should summarise a per-subject budget over the counters of its app and current window', async () => {
    const top = [
      { subjectType: 'owner', subjectId: 'o-2', calls: 900, listCostUsd: 50 },
      { subjectType: 'owner', subjectId: 'o-1', calls: 1000, listCostUsd: 3.25 },
    ];
    const { service, subjectReads } = serviceOver([{ app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 50 }], {
      summary: { activeSubjects: 12, atLimit: 2, top },
    });

    const [status] = (await service.status(NOW)).budgets;

    expect(subjectReads).toEqual([{ app: 'novel-forge', window: '1h', windowStart: HOUR_START, limits: { maxCalls: 1000, maxListCostUsd: 50 }, top: 10 }]);
    expect(status).toMatchObject({ per: 'subject', maxCalls: 1000, maxListCostUsd: 50, windowEnd: new Date('2026-10-17T14:00:00.000Z') });
    expect(status?.usage).toEqual({ kind: 'subject', activeSubjects: 12, atLimit: 2, top });
  });

  it('should report an empty per-subject window as no active subjects', async () => {
    const { service } = serviceOver([{ app: 'novel-forge', per: 'subject', window: '30d', maxCalls: 10 }]);

    expect((await service.status(NOW)).budgets[0]?.usage).toEqual({ kind: 'subject', activeSubjects: 0, atLimit: 0, top: [] });
  });

  it('should judge the limit on calls alone or on cost alone, whichever the budget sets', async () => {
    const { service, subjectReads } = serviceOver([
      { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 5 },
      { app: 'novel-forge', per: 'subject', window: '1d', maxListCostUsd: 2.5 },
    ]);

    const budgets = (await service.status(NOW)).budgets;

    expect(subjectReads.map(read => read.limits)).toEqual([{ maxCalls: 5 }, { maxListCostUsd: 2.5 }]);
    expect(budgets[0]).not.toHaveProperty('maxListCostUsd');
    expect(budgets[1]).not.toHaveProperty('maxCalls');
  });

  it('should pass no limit for a budget without one, so no subject counts as at its limit', async () => {
    const { service, subjectReads } = serviceOver([{ app: 'novel-forge', per: 'subject', window: '1h' }]);

    await service.status(NOW);

    expect(subjectReads[0]?.limits).toEqual({});
  });

  it('should leave the whole-app counter out of a per-subject view when a per-app budget shares its window', async () => {
    const { service, subjectReads } = serviceOver([
      { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 10 },
      { app: 'novel-forge', per: 'app', window: '1h', maxCalls: 1000 },
      { app: 'novel-forge', per: 'subject', window: '1d', maxCalls: 50 },
      { app: 'memoir', per: 'subject', window: '1h', maxCalls: 10 },
    ]);

    await service.status(NOW);

    expect(subjectReads.map(read => read.excluding)).toEqual([
      { app: 'novel-forge', subjectType: 'app', subjectId: 'novel-forge', window: '1h', windowStart: HOUR_START },
      undefined,
      undefined,
    ]);
  });

  it('should report budgets sharing counters with the same usage, each against its own limits', async () => {
    const { service, subjectReads } = serviceOver(
      [
        { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 10 },
        { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 5 },
      ],
      { summary: { activeSubjects: 3, atLimit: 1, top: [] } },
    );

    const budgets = (await service.status(NOW)).budgets;

    expect(budgets.map(budget => budget.index)).toEqual([0, 1]);
    expect(subjectReads.map(read => [read.windowStart, read.limits])).toEqual([
      [HOUR_START, { maxCalls: 10 }],
      [HOUR_START, { maxCalls: 5 }],
    ]);
  });

  it('should start a fresh window at the exact boundary instant', async () => {
    const boundary = new Date('2026-10-18T00:00:00.000Z');
    const { service, counterReads } = serviceOver([{ app: 'memoir', per: 'app', window: '1d', maxCalls: 10 }]);

    const [status] = (await service.status(boundary)).budgets;

    expect(status).toMatchObject({ windowStart: boundary, windowEnd: new Date('2026-10-19T00:00:00.000Z') });
    expect(counterReads[0]?.windowStart).toEqual(boundary);
  });

  it('should report a 30-day window as a fixed epoch bucket, not a calendar month', async () => {
    const { service } = serviceOver([{ app: 'memoir', per: 'app', window: '30d', maxCalls: 10 }]);

    const { windowStart, windowEnd } = (await service.status(NOW)).budgets[0]!;

    expect(windowStart.getTime() % (30 * 86_400_000)).toBe(0);
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(30 * 86_400_000);
    expect(windowStart <= NOW && NOW < windowEnd).toBe(true);
  });
});
