import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';

import { type BudgetSpec } from '@modules/catalog/catalog.types';
import { MeteringService } from '@modules/metering/metering.service';
import { type LedgerClaim } from '@modules/metering/metering.types';

import { FakeMeteringRepository } from './fake-metering.repository';

const NOW = new Date('2026-10-17T13:47:12.000Z');
const SUBJECT = { type: 'owner' as const, id: 'o-1' };
const PER_OWNER: BudgetSpec = { app: 'novel-forge', per: 'subject', window: '1h', maxCalls: 1000, maxListCostUsd: 50 };
const PER_APP: BudgetSpec = { app: 'novel-forge', per: 'app', window: '1d', maxCalls: 10_000 };
const MEMOIR: BudgetSpec = { app: 'memoir', per: 'app', window: '1d', maxCalls: 5 };
const CLAIM: LedgerClaim = { requestId: 'req-1', app: 'novel-forge', subject: SUBJECT, task: 'novel-forge.chat', model: 'opus', catalogVersion: 3, stream: false };

let restoreLogger: RestoreLogger;
beforeAll(() => (restoreLogger = silenceLogger()));
afterAll(() => restoreLogger());

async function failureOf(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('MeteringService.claim', () => {
  it('should insert a pending row for the request id', async () => {
    const repository = new FakeMeteringRepository();
    await new MeteringService(repository.asRepository()).claim({ ...CLAIM, alias: 'opus', effort: 'low' });
    expect(repository.claimed.get('req-1')).toMatchObject({ status: 'pending', subjectType: 'owner', subjectId: 'o-1', alias: 'opus', effort: 'low', catalogVersion: 3 });
  });

  it('should refuse a request id that was already claimed', async () => {
    const service = new MeteringService(new FakeMeteringRepository().asRepository());
    await service.claim(CLAIM);
    expect(AppError.is(await failureOf(service.claim(CLAIM)), AppErrorCode.SYN_DUPLICATE_REQUEST)).toBe(true);
  });
});

describe('MeteringService.admit', () => {
  it("should admit against the calling app's budgets only, keyed per subject or per app in the current window", async () => {
    const repository = new FakeMeteringRepository();
    const counters = await new MeteringService(repository.asRepository()).admit({ budgets: [PER_OWNER, PER_APP, MEMOIR], app: 'novel-forge', subject: SUBJECT, now: NOW });

    expect(counters).toEqual([
      { app: 'novel-forge', subjectType: 'app', subjectId: 'novel-forge', window: '1d', windowStart: new Date('2026-10-17T00:00:00.000Z') },
      { app: 'novel-forge', subjectType: 'owner', subjectId: 'o-1', window: '1h', windowStart: new Date('2026-10-17T13:00:00.000Z') },
    ]);
    expect(repository.admissions[0]?.map(request => [request.maxCalls, request.maxListCostUsd])).toEqual([
      [10_000, undefined],
      [1000, 50],
    ]);
  });

  it('should count a counter two budgets share once, under the tightest of their limits', async () => {
    const repository = new FakeMeteringRepository();
    const hourly: BudgetSpec = { app: 'novel-forge', per: 'app', window: '1h', maxCalls: 500 };
    const cheaper: BudgetSpec = { app: 'novel-forge', per: 'app', window: '1h', maxCalls: 900, maxListCostUsd: 5 };

    const counters = await new MeteringService(repository.asRepository()).admit({ budgets: [hourly, cheaper], app: 'novel-forge', subject: SUBJECT, now: NOW });

    expect(repository.admissions[0]).toEqual([{ key: counters[0], maxCalls: 500, maxListCostUsd: 5 }]);
    expect(counters).toHaveLength(1);
  });

  it('should treat a per-subject budget for an app subject and a per-app budget as one counter', async () => {
    const repository = new FakeMeteringRepository();
    const perSubject: BudgetSpec = { app: 'novel-forge', per: 'subject', window: '1d', maxListCostUsd: 20 };

    const counters = await new MeteringService(repository.asRepository()).admit({
      budgets: [PER_APP, perSubject],
      app: 'novel-forge',
      subject: { type: 'app', id: 'novel-forge' },
      now: NOW,
    });

    expect(counters).toEqual([{ app: 'novel-forge', subjectType: 'app', subjectId: 'novel-forge', window: '1d', windowStart: new Date('2026-10-17T00:00:00.000Z') }]);
    expect(repository.admissions[0]?.map(request => [request.maxCalls, request.maxListCostUsd])).toEqual([[10_000, 20]]);
  });

  it('should admit counters in key order, so concurrent admissions lock rows in the same order', async () => {
    const repository = new FakeMeteringRepository();
    await new MeteringService(repository.asRepository()).admit({ budgets: [PER_OWNER, PER_APP], app: 'novel-forge', subject: SUBJECT, now: NOW });
    expect(repository.admissions[0]?.map(request => request.key.subjectType)).toEqual(['app', 'owner']);
  });

  it('should refuse with the call code when the call count is what ran out', async () => {
    const repository = new FakeMeteringRepository();
    repository.refuse = request => ({ request, counter: { calls: 1000, listCostUsd: 12 } });
    const error = await failureOf(new MeteringService(repository.asRepository()).admit({ budgets: [PER_OWNER], app: 'novel-forge', subject: SUBJECT, now: NOW }));
    expect(AppError.is(error, AppErrorCode.SYN_BUDGET_CALLS)).toBe(true);
    expect((error as AppError).status).toBe(429);
  });

  it('should refuse with the cost code when the list cost reached its limit', async () => {
    const repository = new FakeMeteringRepository();
    repository.refuse = request => ({ request, counter: { calls: 12, listCostUsd: 50.000001 } });
    const error = await failureOf(new MeteringService(repository.asRepository()).admit({ budgets: [PER_OWNER], app: 'novel-forge', subject: SUBJECT, now: NOW }));
    expect(AppError.is(error, AppErrorCode.SYN_BUDGET_COST)).toBe(true);
  });

  it('should refuse a zero limit without counting, since the first call of a window is always inserted', async () => {
    const repository = new FakeMeteringRepository();
    const service = new MeteringService(repository.asRepository());

    const calls = await failureOf(service.admit({ budgets: [{ ...PER_APP, maxCalls: 0 }], app: 'novel-forge', subject: SUBJECT, now: NOW }));
    const cost = await failureOf(service.admit({ budgets: [{ ...PER_APP, maxCalls: undefined, maxListCostUsd: 0 }], app: 'novel-forge', subject: SUBJECT, now: NOW }));

    expect(AppError.is(calls, AppErrorCode.SYN_BUDGET_CALLS)).toBe(true);
    expect(AppError.is(cost, AppErrorCode.SYN_BUDGET_COST)).toBe(true);
    expect(repository.admissions).toHaveLength(0);
  });
});

describe('MeteringService.settle', () => {
  it('should write the outcome onto the claimed row and charge the list cost to the admitted counters', async () => {
    const repository = new FakeMeteringRepository();
    const counters = [{ app: 'novel-forge', subjectType: 'owner', subjectId: 'o-1', window: '1h' as const, windowStart: NOW }];
    const usage = { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningTokens: 5 };

    await new MeteringService(repository.asRepository()).settle({
      claim: { ...CLAIM, alias: 'opus', effort: 'low' },
      counters,
      outcome: {
        status: 'ok',
        usage,
        cost: { listUsd: 0.0213, billedUsd: 0 },
        latencyMs: 812,
        ttftMs: 140,
        attempts: 2,
        provider: 'openrouter',
        deploymentId: 'anthropic/claude-opus',
      },
    });

    expect(repository.settlements[0]).toEqual({
      requestId: 'req-1',
      charged: counters,
      listCostUsd: 0.0213,
      values: {
        status: 'ok',
        errorCode: null,
        alias: 'opus',
        model: 'opus',
        provider: 'openrouter',
        deploymentId: 'anthropic/claude-opus',
        catalogVersion: 3,
        inputTokens: 100,
        cachedInputTokens: 40,
        outputTokens: 20,
        reasoningTokens: 5,
        listCostUsd: 0.0213,
        billedCostUsd: 0,
        latencyMs: 812,
        ttftMs: 140,
        attempts: 2,
        effort: 'low',
        stream: false,
      },
    });
  });

  it('should never reject, even when the database does', async () => {
    const repository = new FakeMeteringRepository();
    repository.settleFailure = new Error('connection reset');
    const settled = new MeteringService(repository.asRepository()).settle({
      claim: CLAIM,
      counters: [],
      outcome: { status: 'error', cost: { listUsd: 0, billedUsd: 0 }, latencyMs: 1, attempts: 1 },
    });
    expect(await settled).toBeUndefined();
  });
});
