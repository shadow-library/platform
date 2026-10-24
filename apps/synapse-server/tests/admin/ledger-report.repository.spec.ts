import { describe, expect, it } from 'bun:test';

import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { constraintErrorMap } from '@server/database/database.constants';

import { LedgerReportRepository, type SubjectCountersQuery } from '@modules/admin/ledger-report.repository';

import { type ExecutedQuery, fakePostgres, type QueryAnswer } from '../metering/fake-postgres';

const WINDOW_START = new Date('2026-10-17T13:00:00.000Z');
const QUERY: SubjectCountersQuery = { app: 'novel-forge', window: '1h', windowStart: WINDOW_START, limits: { maxCalls: 1000, maxListCostUsd: 50 }, top: 10 };

function repositoryOver(answer?: QueryAnswer): { repository: LedgerReportRepository; queries: ExecutedQuery[] } {
  const fake = fakePostgres(answer);
  return { repository: new LedgerReportRepository(new FakeDatabaseService({ postgres: fake.db, constraintErrorMap })), queries: fake.queries };
}

describe('LedgerReportRepository.budgetCounter', () => {
  it('should read the one counter row of the key', async () => {
    const { repository, queries } = repositoryOver(() => [[41, '12.500000']]);

    const counter = await repository.budgetCounter({ app: 'memoir', subjectType: 'app', subjectId: 'memoir', window: '1d', windowStart: WINDOW_START });

    expect(counter).toEqual({ calls: 41, listCostUsd: 12.5 });
    expect(queries[0]?.sql).toContain('"budget_counters"."window" = $4');
    expect(queries[0]?.params).toEqual(['memoir', 'app', 'memoir', '1d', WINDOW_START.toISOString()]);
  });

  it('should resolve undefined when the window has no counter yet', async () => {
    const { repository } = repositoryOver(() => []);
    expect(await repository.budgetCounter({ app: 'memoir', subjectType: 'app', subjectId: 'memoir', window: '1d', windowStart: WINDOW_START })).toBeUndefined();
  });
});

describe('LedgerReportRepository.subjectCounters', () => {
  it('should count active and at-limit subjects over the whole window and return only the top rows', async () => {
    const { repository, queries } = repositoryOver(() => [
      ['owner', 'o-2', 900, '50.000000', 12, 2],
      ['owner', 'o-1', 1000, '3.250000', 12, 2],
    ]);

    const summary = await repository.subjectCounters(QUERY);

    expect(summary).toEqual({
      activeSubjects: 12,
      atLimit: 2,
      top: [
        { subjectType: 'owner', subjectId: 'o-2', calls: 900, listCostUsd: 50 },
        { subjectType: 'owner', subjectId: 'o-1', calls: 1000, listCostUsd: 3.25 },
      ],
    });
    const { sql, params } = queries[0]!;
    expect(sql).toContain('(count(*) over ())::int');
    expect(sql).toContain('order by "budget_counters"."list_cost_usd" desc, "budget_counters"."calls" desc');
    expect(sql).toMatch(/limit \$\d+$/);
    expect(params.at(-1)).toBe(10);
  });

  it('should count a subject at its limit on either limit, with the test admission refuses by', async () => {
    const { repository, queries } = repositoryOver();

    await repository.subjectCounters(QUERY);

    expect(queries[0]?.sql).toContain('count(*) filter (where not ("budget_counters"."calls" < $1 and "budget_counters"."list_cost_usd" < $2::numeric)) over ()');
    expect(queries[0]?.params.slice(0, 2)).toEqual([1000, '50.000000']);
  });

  it('should judge a budget limited on calls alone by its calls only', async () => {
    const { repository, queries } = repositoryOver();

    await repository.subjectCounters({ ...QUERY, limits: { maxCalls: 5 } });

    expect(queries[0]?.sql).toContain('filter (where not "budget_counters"."calls" < $1)');
    expect(queries[0]?.sql).not.toContain('list_cost_usd" <');
  });

  it('should judge a budget limited on cost alone by its cost only', async () => {
    const { repository, queries } = repositoryOver();

    await repository.subjectCounters({ ...QUERY, limits: { maxListCostUsd: 2.5 } });

    expect(queries[0]?.sql).toContain('filter (where not "budget_counters"."list_cost_usd" < $1::numeric)');
    expect(queries[0]?.params[0]).toBe('2.500000');
  });

  it('should count no subject at its limit when the budget sets none', async () => {
    const { repository, queries } = repositoryOver();

    await repository.subjectCounters({ ...QUERY, limits: {} });

    expect(queries[0]?.sql).toContain('filter (where false)');
  });

  it('should report an empty window as no active subjects', async () => {
    const { repository } = repositoryOver(() => []);
    expect(await repository.subjectCounters(QUERY)).toEqual({ activeSubjects: 0, atLimit: 0, top: [] });
  });

  it('should leave out the excluded counter row', async () => {
    const { repository, queries } = repositoryOver();

    await repository.subjectCounters({ ...QUERY, excluding: { app: 'novel-forge', subjectType: 'app', subjectId: 'novel-forge', window: '1h', windowStart: WINDOW_START } });

    expect(queries[0]?.sql).toMatch(/\("budget_counters"\."subject_type" <> \$\d+ or "budget_counters"\."subject_id" <> \$\d+\)/);
    expect(queries[0]?.params).toContain('app');
  });
});
