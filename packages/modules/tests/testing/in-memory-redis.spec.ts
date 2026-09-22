/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { InMemoryRedis, TestingErrorCode } from '@shadow-library/modules/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('InMemoryRedis', () => {
  let now: number;
  let redis: InMemoryRedis;

  beforeEach(() => {
    now = 1_000_000;
    redis = new InMemoryRedis({ now: () => now });
  });

  describe('strings', () => {
    it('should read back a value and answer null for a missing key', async () => {
      expect(await redis.set('key', 'value')).toBe('OK');
      expect(await redis.get('key')).toBe('value');
      expect(await redis.get('missing')).toBeNull();
    });

    it('should store numbers as their string form', async () => {
      await redis.set('key', 42);
      expect(await redis.get('key')).toBe('42');
    });

    it('should expire a key set with EX once the clock passes it', async () => {
      await redis.set('key', 'value', 'EX', 60);
      now += 59_999;
      expect(await redis.get('key')).toBe('value');
      now += 1;
      expect(await redis.get('key')).toBeNull();
    });

    it('should expire a key set with PX in milliseconds', async () => {
      await redis.set('key', 'value', 'PX', 10);
      now += 10;
      expect(await redis.get('key')).toBeNull();
    });

    it('should only set with NX while the key is absent', async () => {
      expect(await redis.set('slot', '1', 'EX', 60, 'NX')).toBe('OK');
      expect(await redis.set('slot', '2', 'EX', 60, 'NX')).toBeNull();
      expect(await redis.get('slot')).toBe('1');

      now += 60_000;
      expect(await redis.set('slot', '3', 'EX', 60, 'NX')).toBe('OK');
    });

    it('should only set with XX while the key is present', async () => {
      expect(await redis.set('key', 'value', 'XX')).toBeNull();
      await redis.set('key', 'value');
      expect(await redis.set('key', 'next', 'XX')).toBe('OK');
    });

    it('should drop the ttl on a plain overwrite and keep it with KEEPTTL', async () => {
      await redis.set('key', 'value', 'EX', 60);
      await redis.set('key', 'kept', 'KEEPTTL');
      expect(await redis.ttl('key')).toBe(60);

      await redis.set('key', 'plain');
      expect(await redis.ttl('key')).toBe(-1);
    });

    it('should refuse malformed SET options', async () => {
      await expect(redis.set('key', 'value', 'EX', 0)).rejects.toMatchObject({ code: TestingErrorCode.REDIS_INVALID_EXPIRE.code });
      await expect(redis.set('key', 'value', 'EX')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_SYNTAX.code });
      await expect(redis.set('key', 'value', 'NX', 'XX')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_SYNTAX.code });
      await expect(redis.set('key', 'value', 'GET')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_SYNTAX.code });
    });

    it('should return and remove a value with getdel', async () => {
      await redis.set('code', 'payload');
      expect(await redis.getdel('code')).toBe('payload');
      expect(await redis.getdel('code')).toBeNull();
    });

    it('should count only live keys deleted', async () => {
      await redis.set('a', '1');
      await redis.set('b', '1', 'PX', 1);
      now += 1;
      expect(await redis.del('a', 'b', 'c', 'a')).toBe(1);
    });

    it('should answer mget in order with null for missing and non-string keys', async () => {
      await redis.set('a', '1');
      await redis.sadd('set', 'member');
      expect(await redis.mget('a', 'missing', 'set')).toEqual(['1', null, null]);
    });
  });

  describe('counters', () => {
    it('should start a missing counter at zero', async () => {
      expect(await redis.incr('counter')).toBe(1);
      expect(await redis.incrby('counter', 5)).toBe(6);
      expect(await redis.get('counter')).toBe('6');
    });

    it('should keep the ttl of a counter it increments', async () => {
      await redis.set('counter', '1', 'EX', 30);
      await redis.incr('counter');
      expect(await redis.ttl('counter')).toBe(30);
    });

    it('should refuse to increment a non-integer value', async () => {
      await redis.set('key', 'abc');
      await expect(redis.incr('key')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_NOT_INTEGER.code });
    });
  });

  describe('expiry', () => {
    it('should report -2 for a missing key and -1 for a persistent one', async () => {
      await redis.set('key', 'value');
      expect(await redis.ttl('missing')).toBe(-2);
      expect(await redis.ttl('key')).toBe(-1);
    });

    it('should round the remaining ttl to the nearest second', async () => {
      await redis.set('key', 'value', 'EX', 10);
      now += 1_400;
      expect(await redis.ttl('key')).toBe(9);
      now += 200;
      expect(await redis.ttl('key')).toBe(8);
    });
  });

  describe('sets', () => {
    it('should add and remove members, counting only changes', async () => {
      expect(await redis.sadd('set', 'a', 'b', 'a')).toBe(2);
      expect(await redis.srem('set', 'a', 'missing')).toBe(1);
      expect(await redis.srem('set', 'b')).toBe(1);
    });

    it('should delete a set once its last member is removed', async () => {
      await redis.sadd('set', 'a');
      await redis.srem('set', 'a');
      expect(await redis.get('set')).toBeNull();
    });

    it('should refuse a string read of a set and a set write to a string', async () => {
      await redis.sadd('set', 'a');
      await redis.set('string', 'value');
      await expect(redis.get('set')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_WRONG_TYPE.code });
      await expect(redis.sadd('string', 'a')).rejects.toMatchObject({ code: TestingErrorCode.REDIS_WRONG_TYPE.code });
    });
  });

  describe('ping', () => {
    it('should answer PONG', async () => {
      expect(await redis.ping()).toBe('PONG');
    });
  });

  describe('call', () => {
    it('should dispatch a command by name case-insensitively', async () => {
      await redis.set('key', 'value');
      expect(await redis.call('EXPIRE', 'key', 30, 'NX')).toBe(1);
      expect(await redis.ttl('key')).toBe(30);
    });

    it('should refuse a command it does not implement', async () => {
      const error = await redis.call('HGETALL', 'key').catch((caught: unknown) => caught);
      expect(AppError.is(error, TestingErrorCode.REDIS_UNKNOWN_COMMAND)).toBe(true);
    });
  });

  describe('multi', () => {
    it('should run the rate-limit transaction and resolve [error, reply] pairs', async () => {
      const first = await redis.multi().incr('rl:key').call('EXPIRE', 'rl:key', 60, 'NX').ttl('rl:key').exec();
      now += 10_000;
      const second = await redis.multi().incr('rl:key').call('EXPIRE', 'rl:key', 60, 'NX').ttl('rl:key').exec();

      expect(first).toEqual([
        [null, 1],
        [null, 1],
        [null, 60],
      ]);
      expect(second).toEqual([
        [null, 2],
        [null, 0],
        [null, 50],
      ]);
    });

    it('should report a runtime failure in place and still run the rest', async () => {
      await redis.set('text', 'abc');
      const [failed, succeeded] = await redis.multi().incr('text').call('SET', 'other', 'value').exec();

      expect(failed?.[0]).toMatchObject({ code: TestingErrorCode.REDIS_NOT_INTEGER.code });
      expect(succeeded).toEqual([null, 'OK']);
    });

    it('should abort the whole transaction on an unknown command', async () => {
      const transaction = redis.multi().call('SET', 'key', 'value').call('HSET', 'hash', 'field', 'value');
      await expect(transaction.exec()).rejects.toMatchObject({ code: TestingErrorCode.REDIS_UNKNOWN_COMMAND.code });
      expect(await redis.get('key')).toBeNull();
    });
  });
});
