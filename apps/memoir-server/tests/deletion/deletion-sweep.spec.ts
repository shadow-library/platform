import '@server/bootstrap';

import { describe, expect, it } from 'bun:test';

import { drizzle } from 'drizzle-orm/bun-sql';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { DeletionRepository, type DeletionService, DeletionSweepService, type StalledDeletion } from '@modules/deletion';
import { type SchedulerService } from '@modules/scheduler';
import { type Account, schema } from '@server/database';

const PAGE_SIZE = 50;

interface FindStalledCall {
  afterId: bigint;
  excluded: Account.DeletionState[];
}

function harness(stalled: StalledDeletion[], identityCloseConfigured: boolean) {
  const calls: FindStalledCall[] = [];
  const driven: bigint[] = [];
  const repository = {
    findStalled: async (_staleBefore: Date, afterId: bigint, limit: number, excluded: Account.DeletionState[]) => {
      calls.push({ afterId, excluded });
      return stalled.filter(account => account.accountId > afterId && !excluded.includes(account.deletionState)).slice(0, limit);
    },
  } as unknown as DeletionRepository;
  const deletionService = {
    drive: async (accountId: bigint) => driven.push(accountId),
    parkedStates: () => (identityCloseConfigured ? [] : ['data_deleted']),
  } as unknown as DeletionService;
  const sweep = new DeletionSweepService({} as SchedulerService, repository, deletionService);
  return { sweep, calls, driven };
}

function parked(count: number, state: Account.DeletionState, firstId = 1): StalledDeletion[] {
  return Array.from({ length: count }, (_, index) => ({ accountId: BigInt(firstId + index), deletionState: state }));
}

describe('DeletionSweepService', () => {
  it('should resume a newer stalled deletion behind a full page of accounts resting at data_deleted without an identity close', async () => {
    const stalled = [...parked(PAGE_SIZE, 'data_deleted'), { accountId: 999n, deletionState: 'blobs_deleted' as const }];
    const { sweep, driven } = harness(stalled, false);

    await sweep.sweep();

    expect(driven).toEqual([999n]);
  });

  it('should keep resuming data_deleted accounts while an identity close is configured', async () => {
    const { sweep, driven } = harness(parked(2, 'data_deleted'), true);

    await sweep.sweep();

    expect(driven).toEqual([1n, 2n]);
  });

  it('should page past accounts that never advance, so every stalled deletion is reached and the walk wraps around', async () => {
    const stalled = parked(PAGE_SIZE + 1, 'blobs_deleted');
    const { sweep, calls, driven } = harness(stalled, true);

    await sweep.sweep();
    await sweep.sweep();
    await sweep.sweep();

    expect(calls.map(call => call.afterId)).toEqual([0n, BigInt(PAGE_SIZE), 0n]);
    expect(driven.slice(PAGE_SIZE, PAGE_SIZE + 2)).toEqual([BigInt(PAGE_SIZE + 1), 1n]);
  });
});

describe('DeletionRepository.findStalled', () => {
  const db = drizzle.mock({ schema });
  const repository = new DeletionRepository(new FakeDatabaseService({ postgres: db }));

  it('should read one page after the cursor, leaving out terminal and resting states', async () => {
    const failure = await repository.findStalled(new Date('2026-03-10T00:00:00Z'), 50n, PAGE_SIZE, ['data_deleted']).then(
      () => null,
      (error: unknown) => error,
    );
    if (!(failure instanceof Error) || !('query' in failure) || !('params' in failure)) throw new Error('expected the mock driver to refuse the query');

    expect(String(failure.query)).toContain('"accounts"."deletion_state" not in ($1, $2, $3)');
    expect(String(failure.query)).toContain('"accounts"."id" > $5');
    expect(String(failure.query)).toContain('order by "accounts"."id" asc');
    expect(failure.params).toEqual(['none', 'done', 'data_deleted', '2026-03-10T00:00:00.000Z', 50n, PAGE_SIZE]);
  });
});
