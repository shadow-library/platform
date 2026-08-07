import { afterAll, beforeEach, describe, expect, it } from 'bun:test';

import { OAuthClientService } from '@server/modules/auth/oauth';
import { GENERAL_LIMIT, IP_GENERAL_BUCKET, M2M_CLIENT_BUCKET, M2M_CLIENT_LIMIT, M2M_CLIENT_WINDOW_SECONDS, RateLimiterService } from '@server/modules/infrastructure/security';
import { ApplicationService } from '@server/modules/system/application';

import { TestEnvironment } from '../test-environment';

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

    it('should report a counter’s standing without counting a hit against it', async () => {
      expect(await rateLimiter.peek('spec', 'p1', 1, 60)).toMatchObject({ allowed: true, remaining: 1 });
      await rateLimiter.peek('spec', 'p1', 1, 60);
      expect(await rateLimiter.consume('spec', 'p1', 1, 60)).toMatchObject({ allowed: true, remaining: 0 });
      expect(await rateLimiter.peek('spec', 'p1', 1, 60)).toMatchObject({ allowed: false, remaining: 0 });
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

  describe('per-client M2M budgets', () => {
    const EGRESS_IP = '10.2.0.1';
    let alpha: { clientId: string; secret?: string };
    let beta: { clientId: string; secret?: string };

    const ipCounter = () => env.getRedisClient().get(`rl:${IP_GENERAL_BUCKET}:${EGRESS_IP}`);
    /** Seed counters directly because hundreds of Argon2 token requests would obscure the routing assertion. */
    const seedClientBudget = (clientId: string, hits: number) => env.getRedisClient().set(`rl:${M2M_CLIENT_BUCKET}:${clientId}`, String(hits), 'EX', M2M_CLIENT_WINDOW_SECONDS);

    const token = (client: { clientId: string; secret?: string }, ip = EGRESS_IP) =>
      env.getRouter().mockRequest({
        method: 'POST',
        url: '/oauth2/token',
        remoteAddress: ip,
        headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'grant_type=client_credentials',
      });

    beforeEach(async () => {
      const applicationId = env.getService(ApplicationService).getApplicationOrThrow('shadow-identity').id;
      const clients = env.getService(OAuthClientService);
      alpha = await clients.register({ applicationId, name: 'Alpha Fleet', kind: 'SERVICE', grantTypes: ['client_credentials'] });
      beta = await clients.register({ applicationId, name: 'Beta Fleet', kind: 'SERVICE', grantTypes: ['client_credentials'] });
    });

    it('should give two clients behind one ip independent budgets', async () => {
      await seedClientBudget(alpha.clientId, M2M_CLIENT_LIMIT);

      expect((await token(alpha)).statusCode).toBe(429);
      expect((await token(beta)).statusCode).toBe(200);
    });

    it('should not spend the ip budget on a call that authenticates', async () => {
      expect((await token(alpha)).statusCode).toBe(200);
      expect(await ipCounter()).toBeNull();
    });

    it('should charge a call that never authenticates to its source ip', async () => {
      const forged = await token({ clientId: alpha.clientId, secret: 'not-the-secret' });
      expect(forged.statusCode).toBe(401);
      expect(Number(await ipCounter())).toBe(1);
    });

    it('should still refuse an authenticated call once its ip has flooded', async () => {
      await env.getRedisClient().set(`rl:${IP_GENERAL_BUCKET}:${EGRESS_IP}`, String(GENERAL_LIMIT), 'EX', 60);
      expect((await token(alpha)).statusCode).toBe(429);
      expect((await token(alpha, '10.2.0.2')).statusCode).toBe(200);
    });
  });
});
