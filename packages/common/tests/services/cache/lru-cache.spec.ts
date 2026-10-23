import { beforeEach, describe, expect, it } from 'bun:test';
import { performance } from 'node:perf_hooks';

import { AppError, LRUCache } from '@shadow-library/common';

describe('LRUCache', () => {
  let cache: LRUCache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  describe('constructor()', () => {
    it('should throw an error if capacity is less than or equal to 0', () => {
      expect(() => new LRUCache(0)).toThrowError(AppError);
      expect(() => new LRUCache(-1)).toThrowError(AppError);
    });

    it('should initialize cache correctly with a valid capacity', () => {
      const cache = new LRUCache(5);
      expect(cache).toBeInstanceOf(LRUCache);
    });
  });

  describe('set()', () => {
    it('should set a value in the cache', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should evict the least recently used item when cache is full', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should update the value if key already exists', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'newValue1');
      expect(cache.get('key1')).toBe('newValue1');
    });

    it('should move the key to the front when setting an existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.get('key1');
      cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should reuse a deleted entry if one is available', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.remove('key2');
      cache.set('key4', 'value4');

      expect(cache.get('key4')).toBe('value4');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache['keys'][1]).toBe('key4');
    });
  });

  describe('get()', () => {
    it('should return undefined if key does not exist', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should return the value associated with the key', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should move the accessed key to the front (most recently used)', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key1')).toBe(true);
    });
  });

  describe('has()', () => {
    it('should return true if the key exists in the cache', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false if the key does not exist', () => {
      expect(cache.has('non-existent')).toBe(false);
    });
  });

  describe('peek()', () => {
    it('should return the value without updating the recently used status', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.peek('key1');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(false);
    });

    it('should return undefined if the key does not exist', () => {
      expect(cache.peek('non-existent')).toBeUndefined();
    });
  });

  describe('remove()', () => {
    it('should remove a key and return its value', () => {
      cache.set('key1', 'value1');
      expect(cache.remove('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(false);
    });

    it('should return undefined if the key does not exist', () => {
      expect(cache.remove('non-existent')).toBeUndefined();
    });

    it('should correctly handle removing the last item in the cache', () => {
      cache.set('key1', 'value1');
      cache.remove('key1');
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
    });

    it('should correctly handle removing the head item and update pointers', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.remove('key3');

      expect(cache.peek('key3')).toBeUndefined();
      expect(cache.peek('key2')).toBe('value2');
      expect(cache['top']).toBe(1);
    });

    it('should correctly handle removing the tail item and update pointers', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.remove('key1');

      expect(cache.peek('key1')).toBeUndefined();
      expect(cache.peek('key2')).toBe('value2');
      expect(cache['bottom']).toBe(1);
    });

    it('should update forward and backward pointers when removing an item', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.remove('key2');

      expect(cache.peek('key1')).toBe('value1');
      expect(cache.peek('key3')).toBe('value3');

      expect(cache['upward'][0]).toBe(2);
      expect(cache['downward'][2]).toBe(0);
    });

    it('should add the deleted pointer back to the deleted array', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.remove('key2');

      expect(cache['deletedSize']).toBe(1);
      expect(cache['deleted'][0]).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should clear all items from the cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('splayOnTop()', () => {
    it('should not modify anything if the pointer is already the head', () => {
      cache.set('key1', 'value1');
      cache['splayOnTop'](0);

      expect(cache.get('key1')).toBe('value1');
    });

    it('should move a pointer to the top when it is not the head', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache['splayOnTop'](1);
      expect(cache['top']).toBe(1);
    });
  });

  describe('getTypedArray()', () => {
    it('should return Uint8Array if capacity is less than or equal to 256', () => {
      const TypedArray = LRUCache['getTypedArray'](256);
      expect(TypedArray).toBe(Uint8Array);
    });

    it('should return Uint16Array if capacity is less than or equal to 65536', () => {
      const TypedArray = LRUCache['getTypedArray'](65536);
      expect(TypedArray).toBe(Uint16Array);
    });

    it('should return Uint32Array if capacity is less than or equal to 4294967295', () => {
      const TypedArray = LRUCache['getTypedArray'](4294967295);
      expect(TypedArray).toBe(Uint32Array);
    });

    it('should throw an error if capacity exceeds 4294967296', () => {
      expect(() => LRUCache['getTypedArray'](4294967297)).toThrow(AppError);
    });
  });

  describe('TTL (Time To Live)', () => {
    describe('constructor with ttl option', () => {
      it('should initialize cache with TTL option', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        expect(ttlCache).toBeInstanceOf(LRUCache);
      });

      it('should initialize ttls array when ttl option is provided', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        expect(ttlCache['ttls']).toHaveLength(3);
      });

      it('should not initialize ttls array when ttl option is not provided', () => {
        const noTtlCache = new LRUCache(3);
        expect(noTtlCache['ttls']).toHaveLength(0);
      });
    });

    describe('set() with TTL', () => {
      it('should set TTL timestamp when adding new item', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        ttlCache.set('key1', 'value1');

        const ttl = ttlCache['ttls'][0];
        expect(ttl).toBeGreaterThan(performance.now() + 900);
      });

      it('should update TTL timestamp when updating existing item', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        ttlCache.set('key1', 'value1');
        const firstTtl = ttlCache['ttls'][0] as number;

        Bun.sleepSync(2);

        ttlCache.set('key1', 'updated');
        const secondTtl = ttlCache['ttls'][0];

        expect(secondTtl).toBeGreaterThan(firstTtl);
      });
    });

    describe('get() with TTL', () => {
      it('should return value if TTL has not expired', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        ttlCache.set('key1', 'value1');

        const value = ttlCache.get('key1');
        expect(value).toBe('value1');
      });

      it('should return undefined and remove item if TTL has expired', async () => {
        const ttlCache = new LRUCache(3, { ttl: 2 });
        ttlCache.set('key1', 'value1');

        await Bun.sleep(3);

        const value = ttlCache.get('key1');
        expect(value).toBeUndefined();
        expect(ttlCache.has('key1')).toBe(false);
      });

      it('should handle mixed expired and non-expired items', async () => {
        const ttlCache = new LRUCache(3, { ttl: 3 });
        ttlCache.set('key1', 'value1');

        await Bun.sleep(2);
        ttlCache.set('key2', 'value2');

        await Bun.sleep(1);

        expect(ttlCache.get('key1')).toBeUndefined();
        expect(ttlCache.get('key2')).toBe('value2');
      });
    });

    describe('peek() with TTL', () => {
      it('should return value if TTL has not expired', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        ttlCache.set('key1', 'value1');

        const value = ttlCache.peek('key1');
        expect(value).toBe('value1');
      });

      it('should return undefined and remove item if TTL has expired', async () => {
        const ttlCache = new LRUCache(3, { ttl: 2 });
        ttlCache.set('key1', 'value1');

        await Bun.sleep(3);

        const value = ttlCache.peek('key1');
        expect(value).toBeUndefined();
        expect(ttlCache.has('key1')).toBe(false);
      });
    });

    describe('has() with TTL', () => {
      it('should return true if TTL has not expired', () => {
        const ttlCache = new LRUCache(3, { ttl: 1000 });
        ttlCache.set('key1', 'value1');

        expect(ttlCache.has('key1')).toBe(true);
      });

      it('should return false and remove item if TTL has expired', async () => {
        const ttlCache = new LRUCache(3, { ttl: 2 });
        ttlCache.set('key1', 'value1');

        await Bun.sleep(3);

        expect(ttlCache.has('key1')).toBe(false);
      });
    });

    describe('Edge cases with TTL', () => {
      it('should not expire items when TTL is set to 0', () => {
        const ttlCache = new LRUCache(3, { ttl: 0 });
        ttlCache.set('key1', 'value1');

        Bun.sleepSync(2);
        const value = ttlCache.get('key1');
        expect(value).toBe('value1');
      });

      it('should handle very short TTL', async () => {
        const ttlCache = new LRUCache(3, { ttl: 1 });
        ttlCache.set('key1', 'value1');

        await Bun.sleep(5);

        expect(ttlCache.get('key1')).toBeUndefined();
      });

      it('should handle very long TTL', () => {
        const ttlCache = new LRUCache(3, { ttl: 86400000 });
        ttlCache.set('key1', 'value1');

        expect(ttlCache.get('key1')).toBe('value1');
      });

      it('should not affect cache without TTL option', () => {
        const noTtlCache = new LRUCache(3);
        noTtlCache.set('key1', 'value1');

        expect(noTtlCache.get('key1')).toBe('value1');
      });
    });

    describe('TTL with updates and access patterns', () => {
      it('should reset TTL on update', () => {
        const ttlCache = new LRUCache(3, { ttl: 100 });
        ttlCache.set('key1', 'value1');

        Bun.sleepSync(90);
        ttlCache.set('key1', 'updated');

        // Past the original 100ms expiry yet inside the refreshed window; small sleeps drift the least under load
        Bun.sleepSync(20);

        expect(ttlCache.get('key1')).toBe('updated');
      });

      it('should extend lifetime with get() moving item to top', () => {
        const ttlCache = new LRUCache(3, { ttl: 50 });
        ttlCache.set('key1', 'value1');
        ttlCache.set('key2', 'value2');
        ttlCache.set('key3', 'value3');

        Bun.sleepSync(30);

        // get() moves key1 to the top but does not reset its TTL
        ttlCache.get('key1');

        Bun.sleepSync(30);

        expect(ttlCache.get('key1')).toBeUndefined();
      });
    });
  });
});
