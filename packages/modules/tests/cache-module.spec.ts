/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { Module, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { CacheModule } from '../src/cache/cache.module';
import { CacheService } from '../src/cache/cache.service';
import { MemcacheService } from '../src/cache/memcache.service';
import { RedisCacheService } from '../src/cache/redis-cache.service';

describe('Cache Module', () => {
  const redisMock = {
    get: mock(),
    set: mock(),
    del: mock(),
    incrby: mock(),
    decrby: mock(),
    publish: mock(),
  };

  const memcachedMock = {
    get: mock(),
    set: mock(),
    del: mock(),
    incr: mock(),
    decr: mock(),
  };

  beforeEach(() => {
    mock.clearAllMocks();
  });

  describe('Redis Strategy (Default)', () => {
    let cacheService: CacheService;
    let redisCacheService: RedisCacheService;

    @Module({
      imports: [CacheModule.forRoot({ redis: redisMock as any })],
    })
    class RedisAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(RedisAppModule);
      cacheService = app.get(CacheService);
      redisCacheService = app.get(RedisCacheService);
    });

    it('should be defined', () => {
      expect(cacheService).toBeDefined();
      expect(redisCacheService).toBeDefined();
    });

    it('should use Redis as L2 cache', async () => {
      redisMock.get.mockResolvedValue(JSON.stringify({ test: 'data' }));

      const result = await cacheService.get('test-key');
      expect(result).toEqual({ test: 'data' });
      expect(redisMock.get).toHaveBeenCalledWith('test-key');
    });

    it('should use L1 cache on second hit', async () => {
      redisMock.get.mockResolvedValue(JSON.stringify({ test: 'data' }));

      await cacheService.get('test-key');
      expect(redisMock.get).toHaveBeenCalledTimes(1);

      const result = await cacheService.get('test-key');
      expect(result).toStrictEqual({ test: 'data' });
      expect(redisMock.get).toHaveBeenCalledTimes(1);
    });

    it('should return null on cache miss', async () => {
      redisMock.get.mockResolvedValue(null);
      const result = await cacheService.get('miss-key');
      expect(result).toBeNull();
    });

    it('should set value in Redis', async () => {
      await cacheService.set('test-key', { test: 'data' }, 60);
      expect(redisMock.set).toHaveBeenCalledWith('test-key', JSON.stringify({ test: 'data' }), 'EX', 60);
    });

    it('should delete value from Redis', async () => {
      await cacheService.del('test-key');
      expect(redisMock.del).toHaveBeenCalledWith('test-key');
    });

    it('should increment value in Redis', async () => {
      redisMock.incrby.mockResolvedValue(2);
      const result = await redisCacheService.incr('test-key', 1);
      expect(result).toBe(2);
      expect(redisMock.incrby).toHaveBeenCalledWith('test-key', 1);
    });

    it('should decrement value in Redis', async () => {
      redisMock.decrby.mockResolvedValue(0);
      const result = await redisCacheService.decr('test-key', 1);
      expect(result).toBe(0);
      expect(redisMock.decrby).toHaveBeenCalledWith('test-key', 1);
    });

    it('should publish message to Redis', async () => {
      await redisCacheService.publish('test-channel', 'test-message');
      expect(redisMock.publish).toHaveBeenCalledWith('test-channel', 'test-message');
    });
  });

  describe('Memcached Strategy', () => {
    let cacheService: CacheService;
    let memcacheService: MemcacheService;

    @Module({
      imports: [CacheModule.forRoot({ redis: redisMock as any, memcached: memcachedMock as any })],
    })
    class MemcachedAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(MemcachedAppModule);
      cacheService = app.get(CacheService);
      memcacheService = app.get(MemcacheService);
    });

    it('should be defined', () => {
      expect(cacheService).toBeDefined();
      expect(memcacheService).toBeDefined();
    });

    it('should use Memcached as L2 cache', async () => {
      memcachedMock.get.mockImplementation((key, cb) => cb(null, { test: 'data' }));

      const result = await cacheService.get('test-key');
      expect(result).toEqual({ test: 'data' });
      expect(memcachedMock.get).toHaveBeenCalled();
    });

    it('should return null on cache miss', async () => {
      memcachedMock.get.mockImplementation((key, cb) => cb(null, undefined));
      const result = await cacheService.get('miss-key');
      expect(result).toBeNull();
    });

    it('should set value in Memcached', async () => {
      memcachedMock.set.mockImplementation((key, value, lifetime, cb) => cb(null));

      await cacheService.set('test-key', { test: 'data' }, 60);
      expect(memcachedMock.set).toHaveBeenCalled();
    });

    it('should delete value from Memcached', async () => {
      memcachedMock.del.mockImplementation((key, cb) => cb(null));
      await cacheService.del('test-key');
      expect(memcachedMock.del).toHaveBeenCalled();
    });

    it('should increment value in Memcached', async () => {
      memcachedMock.incr.mockImplementation((key, amount, cb) => cb(null, 2));
      const result = await memcacheService.incr('test-key', 1);
      expect(result).toBe(2);
      expect(memcachedMock.incr).toHaveBeenCalled();
    });

    it('should decrement value in Memcached', async () => {
      memcachedMock.decr.mockImplementation((key, amount, cb) => cb(null, 0));
      const result = await memcacheService.decr('test-key', 1);
      expect(result).toBe(0);
      expect(memcachedMock.decr).toHaveBeenCalled();
    });

    it('should initialize value on increment if not found in Memcached', async () => {
      memcachedMock.incr.mockImplementation((key, amount, cb) => cb(null, false));
      memcachedMock.set.mockImplementation((key, value, lifetime, cb) => cb(null));

      const result = await memcacheService.incr('new-key', 5);
      expect(result).toBe(5);
      expect(memcachedMock.incr).toHaveBeenCalled();
      expect(memcachedMock.set).toHaveBeenCalledWith('new-key', 5, 0, expect.any(Function));
    });

    it('should initialize value on decrement if not found in Memcached', async () => {
      memcachedMock.decr.mockImplementation((key, amount, cb) => cb(null, false));
      memcachedMock.set.mockImplementation((key, value, lifetime, cb) => cb(null));

      const result = await memcacheService.decr('new-key', 3);
      expect(result).toBe(-3);
      expect(memcachedMock.decr).toHaveBeenCalled();
      expect(memcachedMock.set).toHaveBeenCalledWith('new-key', -3, 0, expect.any(Function));
    });
  });
});
