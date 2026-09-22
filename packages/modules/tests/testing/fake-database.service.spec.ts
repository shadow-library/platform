/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { AppError, ErrorCode } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { FakeDatabaseService, InMemoryRedis, TestingErrorCode } from '@shadow-library/modules/testing';

/**
 * Defining types
 */

interface QueryChain {
  (...args: unknown[]): QueryChain;
  select: QueryChain;
  from: QueryChain;
  prepare: QueryChain;
  execute: QueryChain;
  query: QueryChain;
  users: QueryChain;
  findFirst: QueryChain;
  transaction: QueryChain;
}

/**
 * Declaring the constants
 */
const rejectionOf = (query: unknown): Promise<unknown> =>
  Promise.resolve(query).then(
    () => null,
    (error: unknown) => error,
  );
const DUPLICATE = ErrorCode.conflict('DUPLICATE', 'Already exists');

describe('FakeDatabaseService', () => {
  it('should hand back the postgres client it was given', () => {
    const db = { select: () => [] };
    expect(new FakeDatabaseService({ postgres: db }).getPostgresClient()).toBe(db as never);
  });

  it('should resolve the client itself and its bare property paths when awaited', async () => {
    const db = new FakeDatabaseService().getPostgresClient() as unknown as QueryChain;

    expect(await Promise.resolve(db)).toBe(db);
    const table = db.query.users;
    expect(await Promise.resolve(table)).toBe(table);
  });

  it('should let a unit build queries without a client but fail each one it runs, naming the chain', async () => {
    const db = new FakeDatabaseService().getPostgresClient() as unknown as QueryChain;
    const prepared = db.select().from({}).prepare('by_id');
    const attempts = [db.select().from({}), db.query.users.findFirst(), db.execute('SELECT 1'), prepared.execute(), db.transaction(() => undefined)];
    const errors = await Promise.all(attempts.map(query => rejectionOf(query)));

    for (const error of errors) expect(AppError.is(error, TestingErrorCode.POSTGRES_CLIENT_MISSING)).toBe(true);
    expect((errors[0] as AppError).message).toContain("'postgres.select().from()'");
    expect((errors[3] as AppError).message).toContain("'postgres.select().from().prepare().execute()'");
  });

  it('should serve redis from the in-memory fake it exposes', async () => {
    const redis = new InMemoryRedis();
    const database = new FakeDatabaseService({ redis });
    await database.getRedisClient().set('key', 'value');

    expect(database.redis).toBe(redis);
    expect(await redis.get('key')).toBe('value');
  });

  it('should keep the real constraint mapping in run()', async () => {
    const database = new FakeDatabaseService({ constraintErrorMap: { users_email_unique: DUPLICATE.create() } });
    const violation = { code: 'ERR_POSTGRES_SERVER_ERROR', constraint: 'users_email_unique' };
    const error = await database.run(() => Promise.reject(violation)).catch((caught: unknown) => caught);

    expect(AppError.is(error, DUPLICATE)).toBe(true);
  });

  it('should complete its lifecycle hooks without connecting', async () => {
    const database = new FakeDatabaseService();
    await database.onModuleInit();
    await database.onModuleDestroy();

    expect(database.isRedisEnabled()).toBe(true);
    expect(database.isMemcacheEnabled()).toBe(false);
    expect(() => database.getMemcacheClient()).toThrow(TestingErrorCode.MEMCACHE_UNSUPPORTED.message);
  });
});
