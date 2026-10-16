import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { constraintErrorMap } from '@server/database/database.constants';

import { MeteringRepository } from '@modules/metering/metering.repository';
import { type BudgetAdmissionRequest, type BudgetCounterKey } from '@modules/metering/metering.types';

import { type ExecutedQuery, fakePostgres, type QueryAnswer } from './fake-postgres';

const KEY: BudgetCounterKey = { app: 'novel-forge', subjectType: 'owner', subjectId: 'o-1', window: '1h', windowStart: new Date('2026-10-17T13:00:00.000Z') };
const APP_KEY: BudgetCounterKey = { ...KEY, subjectType: 'app', subjectId: 'novel-forge', window: '1d' };

function repositoryOver(answer?: QueryAnswer): { repository: MeteringRepository; queries: ExecutedQuery[]; log: string[] } {
  const fake = fakePostgres(answer);
  return { repository: new MeteringRepository(new FakeDatabaseService({ postgres: fake.db, constraintErrorMap })), queries: fake.queries, log: fake.log };
}

const isUpsert = (query: ExecutedQuery): boolean => query.sql.startsWith('insert into "budget_counters"');

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

describe('MeteringRepository.claimRequest', () => {
  it('should insert the pending row and do nothing on a request id already present', async () => {
    const { repository, queries } = repositoryOver(() => [['req-1']]);

    expect(
      await repository.claimRequest({ requestId: 'req-1', app: 'a', subjectType: 'user', subjectId: 'u', task: 'a.t', catalogVersion: 1, status: 'pending', stream: false }),
    ).toBe(true);
    expect(queries[0]?.sql).toContain('on conflict ("request_id") do nothing returning "request_id"');
  });

  it('should report a request id another call already claimed', async () => {
    const { repository } = repositoryOver(() => []);
    expect(
      await repository.claimRequest({ requestId: 'req-1', app: 'a', subjectType: 'user', subjectId: 'u', task: 'a.t', catalogVersion: 1, status: 'pending', stream: false }),
    ).toBe(false);
  });

  it('should surface a ledger primary key violation as a duplicate request', async () => {
    const violation = Object.assign(new Error('duplicate key'), { code: 'ERR_POSTGRES_SERVER_ERROR', constraint: 'ledger_pkey' });
    const { repository } = repositoryOver(() => violation);
    const error = await repository
      .claimRequest({ requestId: 'req-1', app: 'a', subjectType: 'user', subjectId: 'u', task: 'a.t', catalogVersion: 1, status: 'pending', stream: false })
      .catch((reason: unknown) => reason);
    expect(AppError.is(error, AppErrorCode.SYN_DUPLICATE_REQUEST)).toBe(true);
  });
});

describe('MeteringRepository.admitBudgets', () => {
  it('should run one conditional upsert per budget, counting the call only below every limit', async () => {
    const { repository, queries, log } = repositoryOver(query => (isUpsert(query) ? [[1]] : []));
    const requests: BudgetAdmissionRequest[] = [
      { key: KEY, maxCalls: 1000, maxListCostUsd: 50 },
      { key: APP_KEY, maxCalls: 10 },
    ];

    expect(await repository.admitBudgets(requests)).toBeUndefined();

    expect(log[0]).toBe('begin');
    expect(log.at(-1)).toBe('commit');
    expect(queries).toHaveLength(2);
    expect(queries[0]?.sql).toContain('do update set "calls" = "budget_counters"."calls" + 1');
    expect(queries[0]?.sql).toContain('where ("budget_counters"."calls" < $7 and "budget_counters"."list_cost_usd" < $8::numeric)');
    expect(queries[0]?.params).toEqual(['novel-forge', 'owner', 'o-1', '1h', '2026-10-17T13:00:00.000Z', 1, 1000, '50.000000']);
    expect(queries[1]?.sql).toContain('where "budget_counters"."calls" < $7 returning');
  });

  it('should always count a call against a budget with no limit', async () => {
    const { repository, queries } = repositoryOver(() => [[1]]);
    await repository.admitBudgets([{ key: KEY }]);
    expect(queries[0]?.sql).toContain('do update set "calls" = "budget_counters"."calls" + 1 returning');
  });

  it('should read the refused counter and roll back the calls earlier budgets counted', async () => {
    const answer: QueryAnswer = query => {
      if (isUpsert(query)) return query.params[1] === 'app' ? [] : [[4]];
      return [[10, '12.5']];
    };
    const { repository, queries, log } = repositoryOver(answer);

    const refusal = await repository.admitBudgets([
      { key: KEY, maxCalls: 1000 },
      { key: APP_KEY, maxCalls: 10 },
    ]);

    expect(refusal).toEqual({ request: { key: APP_KEY, maxCalls: 10 }, counter: { calls: 10, listCostUsd: 12.5 } });
    expect(queries.at(-1)?.sql).toStartWith('select "calls", "list_cost_usd" from "budget_counters" where');
    expect(log.at(-1)).toBe('rollback');
  });

  it('should send nothing when the calling app has no budget', async () => {
    const { repository, queries } = repositoryOver();
    expect(await repository.admitBudgets([])).toBeUndefined();
    expect(queries).toHaveLength(0);
  });
});

describe('MeteringRepository.settle', () => {
  const settledRow: QueryAnswer = query => (query.sql.startsWith('update "ledger"') ? [['req-1']] : []);

  it('should settle only the pending row and add the list cost to every admitted counter in SQL', async () => {
    const { repository, queries, log } = repositoryOver(settledRow);

    await repository.settle('req-1', { status: 'ok', listCostUsd: 0.0213 }, [KEY, APP_KEY], 0.0213);

    expect(log[0]).toBe('begin');
    expect(queries[0]?.sql).toStartWith('update "ledger" set');
    expect(queries[0]?.sql).toContain('where ("ledger"."request_id" = $3 and "ledger"."status" = $4) returning "request_id"');
    expect(queries[0]?.params.slice(-2)).toEqual(['req-1', 'pending']);
    for (const query of queries.slice(1)) {
      expect(query.sql).toStartWith('update "budget_counters" set "list_cost_usd" = "budget_counters"."list_cost_usd" + $1::numeric where');
      expect(query.params[0]).toBe('0.021300');
    }
    expect(queries).toHaveLength(3);
  });

  it('should charge no budget when the row was already settled or swept', async () => {
    const { repository, queries } = repositoryOver(() => []);
    await repository.settle('req-1', { status: 'ok' }, [KEY], 0.5);
    expect(queries).toHaveLength(1);
  });

  it('should leave the counters alone for a call that cost nothing', async () => {
    const { repository, queries } = repositoryOver(settledRow);
    await repository.settle('req-1', { status: 'cancelled' }, [KEY], 0);
    expect(queries).toHaveLength(1);
  });
});

describe('MeteringRepository.sweepLedger', () => {
  const lockedAnswer =
    (unsettled: number): QueryAnswer =>
    query => {
      if (query.sql.includes('pg_try_advisory_xact_lock')) return [{ locked: true }];
      if (query.sql.startsWith('update "ledger"')) return Array.from({ length: unsettled }, (_, index) => [`req-${index}`]);
      return [{ deleted: 42 }];
    };

  it('should mark stale pending rows unsettled and prune old rows, both under the retention lock', async () => {
    const { repository, queries, log } = repositoryOver(lockedAnswer(2));
    const cutoffs = { unsettledBefore: new Date('2026-10-17T11:49:30.000Z'), pruneBefore: new Date('2025-09-12T00:00:00.000Z') };

    expect(await repository.sweepLedger(cutoffs)).toEqual({ unsettled: 2, pruned: 42 });

    expect(log[0]).toBe('begin');
    expect(queries[0]?.sql).toBe("select pg_try_advisory_xact_lock(hashtext('synapse:retention')) as locked");
    expect(queries[1]?.sql).toBe('update "ledger" set "status" = $1, "error_code" = $2 where ("ledger"."status" = $3 and "ledger"."created_at" < $4) returning "request_id"');
    expect(queries[1]?.params).toEqual(['error', 'SYN_UNSETTLED', 'pending', '2026-10-17T11:49:30.000Z']);
    expect(queries[2]?.sql).toContain('delete from "ledger" where "ledger"."created_at" < $1::timestamptz');
    expect(queries[2]?.params).toEqual(['2025-09-12T00:00:00.000Z']);
    expect(log.at(-1)).toBe('commit');
  });

  it('should only mark unsettled rows on a pass that is not the retention one', async () => {
    const { repository, queries } = repositoryOver(lockedAnswer(0));
    expect(await repository.sweepLedger({ unsettledBefore: new Date() })).toEqual({ unsettled: 0 });
    expect(queries).toHaveLength(2);
  });

  it('should touch nothing while another replica holds the lock', async () => {
    const { repository, queries } = repositoryOver(() => [{ locked: false }]);
    expect(await repository.sweepLedger({ unsettledBefore: new Date(), pruneBefore: new Date() })).toBeUndefined();
    expect(queries).toHaveLength(1);
  });
});
