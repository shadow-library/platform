import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AppError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';

import { AuthoringClaimService } from '@modules/jobs/authoring-claim.service';

interface StubOptions {
  acquired?: boolean;
  released?: boolean;
}

function stubDatabase({ acquired = true, released = true }: StubOptions = {}) {
  const calls: string[] = [];
  const outcomes: string[] = [];
  const db = {
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => (calls.push('acquire'), acquired ? [{ projectId: 1n }] : []) }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => (calls.push('heartbeat'), [{ projectId: 1n }]) }) }) }),
    delete: () => ({ where: () => ({ returning: async () => (calls.push('release'), released ? [{ projectId: 1n }] : []) }) }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await run(db);
        outcomes.push('committed');
        return result;
      } catch (error) {
        outcomes.push('rolled back');
        throw error;
      }
    },
  };
  return { service: new AuthoringClaimService({ getPostgresClient: () => db } as never), calls, outcomes };
}

describe('AuthoringClaimService', () => {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const timers = { started: [] as unknown[], cleared: [] as unknown[] };
  let restoreConfig: () => void;

  beforeEach(() => {
    restoreConfig = setConfig({ 'jobs.authoring-claim.ttl-ms': 60_000 });
    timers.started = [];
    timers.cleared = [];
    globalThis.setInterval = ((): unknown => {
      const handle = { unref: () => handle };
      timers.started.push(handle);
      return handle;
    }) as never;
    globalThis.clearInterval = ((handle: unknown) => void timers.cleared.push(handle)) as never;
  });

  afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    restoreConfig();
  });

  it('should release the claim and stop heartbeating when the action throws', async () => {
    const { service, calls } = stubDatabase();

    await expect(
      service.runExclusive(
        1n,
        'finalize',
        () => AppError.internal('conflict'),
        async () => Promise.reject(new Error('model down')),
      ),
    ).rejects.toThrow('model down');

    expect(calls).toEqual(['acquire', 'release']);
    expect(timers.cleared).toEqual(timers.started);
    expect(timers.started).toHaveLength(1);
  });

  it('should refuse without running the action or heartbeating while another holder has the project', async () => {
    const { service, calls } = stubDatabase({ acquired: false });
    let ran = false;

    await expect(
      service.runExclusive(
        1n,
        'plan',
        () => AppError.internal('held elsewhere'),
        async () => void (ran = true),
      ),
    ).rejects.toThrow('held elsewhere');

    expect(ran).toBe(false);
    expect(calls).toEqual(['acquire']);
    expect(timers.started).toEqual([]);
  });

  it('should roll the release back with the write when the settle write fails', async () => {
    const { service, outcomes } = stubDatabase();

    await expect(service.settle(1n, 'token-1', async () => Promise.reject(new Error('write failed')))).rejects.toThrow('write failed');

    expect(outcomes).toEqual(['rolled back']);
  });

  it('should run no settle write once the token no longer holds the claim', async () => {
    const { service } = stubDatabase({ released: false });
    let wrote = false;

    expect(await service.settle(1n, 'token-1', async () => void (wrote = true))).toBe(false);
    expect(wrote).toBe(false);
  });
});
