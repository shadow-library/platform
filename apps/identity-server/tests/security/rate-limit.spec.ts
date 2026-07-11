/**
 * Importing npm packages
 */
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { RateLimiterService } from '@server/modules/infrastructure/security';

import { TestEnvironment } from '../test-environment';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The suite-wide preload disables rate limiting (tests/env.ts); this spec re-enables it through
 * the service's runtime switch and cleans its Redis keys between tests so budgets start fresh.
 */
const env = new TestEnvironment('rate_limit').init();

const registerInit = (ip: string, email: string) => env.getRouter().mockRequest({ method: 'POST', url: '/api/v1/auth/register/init', remoteAddress: ip, payload: { email } });

describe('Rate limiting', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(async () => {
    rateLimiter = env.getService(RateLimiterService);
    rateLimiter.enabled = true;
    const keys = await env.getRedisClient().keys('rl:*');
    if (keys.length > 0) await env.getRedisClient().del(...keys);
  });

  afterAll(() => {
    env.getService(RateLimiterService).enabled = false;
  });

  describe('RateLimiterService', () => {
    it('should allow hits within the budget and deny beyond it', async () => {
      const first = await rateLimiter.consume('spec', 'k1', 2, 60);
      const second = await rateLimiter.consume('spec', 'k1', 2, 60);
      const third = await rateLimiter.consume('spec', 'k1', 2, 60);

      expect(first).toMatchObject({ allowed: true, remaining: 1 });
      expect(second).toMatchObject({ allowed: true, remaining: 0 });
      expect(third.allowed).toBe(false);
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
      expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it('should keep budgets independent across keys and buckets', async () => {
      await rateLimiter.consume('spec', 'k1', 1, 60);
      const otherKey = await rateLimiter.consume('spec', 'k2', 1, 60);
      const otherBucket = await rateLimiter.consume('spec2', 'k1', 1, 60);
      expect(otherKey.allowed).toBe(true);
      expect(otherBucket.allowed).toBe(true);
    });

    it('should block and unblock an ip address', async () => {
      await rateLimiter.blockIp('10.0.0.9', 60);
      expect(await rateLimiter.getIpBlockTtl('10.0.0.9')).toBeGreaterThan(0);
      await rateLimiter.unblockIp('10.0.0.9');
      expect(await rateLimiter.getIpBlockTtl('10.0.0.9')).toBe(0);
    });
  });

  describe('middleware', () => {
    it('should enforce the per-route budget with the same response for unknown accounts', async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await registerInit('10.1.0.1', `user${attempt}@example.com`);
        expect(response.statusCode).toBe(200);
      }
      const rejected = await registerInit('10.1.0.1', 'user6@example.com');
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers['retry-after']).toBeDefined();
      expect(Number(rejected.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('should scope budgets to the client ip', async () => {
      for (let attempt = 1; attempt <= 6; attempt++) await registerInit('10.1.0.2', `a${attempt}@example.com`);
      const otherIp = await registerInit('10.1.0.3', 'b@example.com');
      expect(otherIp.statusCode).toBe(200);
    });

    it('should reject every request from a blocked ip', async () => {
      await rateLimiter.blockIp('10.1.0.4', 120);
      const response = await registerInit('10.1.0.4', 'blocked@example.com');
      expect(response.statusCode).toBe(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('should not throttle when the runtime switch is off', async () => {
      rateLimiter.enabled = false;
      for (let attempt = 1; attempt <= 7; attempt++) {
        const response = await registerInit('10.1.0.5', `off${attempt}@example.com`);
        expect(response.statusCode).toBe(200);
      }
    });
  });
});
