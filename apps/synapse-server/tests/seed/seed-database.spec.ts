import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { type RestoreLogger, silenceLogger } from '@shadow-library/common/testing';

import { AppErrorCode } from '@server/classes';
import { openSeedDatabase, type SeedConnection } from '@server/database/seed';

interface FakeDatabase {
  closed: number;
  $client: { close(): Promise<void> };
}

const URL = 'postgresql://seed.test/synapse';

function open() {
  const calls: SeedConnection[] = [];
  const fake: FakeDatabase = { closed: 0, $client: { close: async () => void fake.closed++ } };
  const seed = openSeedDatabase(URL, config => (calls.push(config), fake as never));
  return { calls, fake, seed };
}

describe('openSeedDatabase', () => {
  let restoreLogger: RestoreLogger;

  beforeAll(() => {
    restoreLogger = silenceLogger();
  });

  afterAll(() => restoreLogger());

  it('should open one unprepared connection to the given url', () => {
    const { calls } = open();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.connection).toEqual({ url: URL, max: 1, prepare: false });
  });

  it('should hand the repository the client it opened', () => {
    const { fake, seed } = open();
    expect(seed.databaseService.getPostgresClient()).toBe(fake as never);
  });

  it('should translate a catalog constraint violation into a catalog conflict', async () => {
    const { seed } = open();
    const violation = Object.assign(new Error('duplicate'), { code: 'ERR_POSTGRES_SERVER_ERROR', constraint: 'catalog_versions_version_unique' });
    const run = seed.databaseService.run(async () => {
      throw violation;
    });
    await expect(run).rejects.toMatchObject({ code: AppErrorCode.SYN_CATALOG_CONFLICT.create().code });
  });

  it('should wrap an unmapped failure as an internal error', async () => {
    const { seed } = open();
    expect(() => seed.databaseService.translateError(new Error('boom'))).toThrow();
  });

  it('should close the underlying client', async () => {
    const { fake, seed } = open();
    await seed.close();
    expect(fake.closed).toBe(1);
  });
});
