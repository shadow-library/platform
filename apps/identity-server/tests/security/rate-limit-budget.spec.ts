import { beforeEach, describe, expect, it } from 'bun:test';

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { type JwtClaims, type KeyService } from '@server/modules/auth/keys';
import { M2M_BUDGET_METADATA } from '@server/modules/infrastructure/security/m2m-budget.decorator';
import { M2MRateLimitMiddleware } from '@server/modules/infrastructure/security/m2m-rate-limit.middleware';
import { RateLimitMiddleware } from '@server/modules/infrastructure/security/rate-limit.middleware';
import { RateLimiterService } from '@server/modules/infrastructure/security/rate-limiter.service';
import { GENERAL_LIMIT, IP_GENERAL_BUCKET, M2M_CLIENT_BUCKET, M2M_CLIENT_LIMIT } from '@server/modules/infrastructure/security/security.constants';
import { ServiceCallerService } from '@server/modules/infrastructure/security/service-caller.service';

const ISSUER = 'https://identity.example.com';
const POD_IP = '10.42.0.17';
const FORGE = 'novel-forge';
const inAnHour = (): number => Math.floor(Date.now() / 1000) + 3600;

const TOKENS: Record<string, JwtClaims> = {
  service: { iss: ISSUER, aud: 'shadow-identity', token_type: 'service', client_id: FORGE, sub: FORGE, exp: inAnHour() },
  user: { iss: ISSUER, aud: 'shadow-identity', token_type: 'user', client_id: FORGE, sub: '42', exp: inAnHour() },
  expired: { iss: ISSUER, aud: 'shadow-identity', token_type: 'service', client_id: FORGE, sub: FORGE, exp: 1 },
  foreignAudience: { iss: ISSUER, aud: 'api://novel-forge', token_type: 'service', client_id: FORGE, sub: FORGE, exp: inAnHour() },
};

const M2M_ROUTE = { method: 'POST', path: '/api/v1/authz/check', [M2M_BUDGET_METADATA]: true } as unknown as HandlerMetadata;
const HUMAN_ROUTE = { method: 'GET', path: '/api/v1/me' } as unknown as HandlerMetadata;

interface RecordingReply {
  statusCode: number;
  headers: Map<string, string>;
  header(name: string, value: string): RecordingReply;
}

function replyWith(statusCode = 200): RecordingReply {
  const reply: RecordingReply = { statusCode, headers: new Map(), header: (name, value) => (reply.headers.set(name, value), reply) };
  return reply;
}

function requestFrom(bearer?: keyof typeof TOKENS): FastifyRequest {
  return { ip: POD_IP, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} } as unknown as FastifyRequest;
}

async function outcome(work: Promise<void>): Promise<unknown> {
  return work.then(
    () => 'served',
    (error: unknown) => error,
  );
}

describe('RateLimitMiddleware budget selection', () => {
  let redis: InMemoryRedis;
  let onRequest: RateLimitMiddleware;
  let onResponse: M2MRateLimitMiddleware;

  const counter = async (bucket: string, key: string): Promise<number> => Number((await redis.get(`rl:${bucket}:${key}`)) ?? 0);
  const spend = (bucket: string, key: string, count: number): Promise<unknown> => redis.set(`rl:${bucket}:${key}`, String(count), 'EX', 30);
  const request = (metadata: HandlerMetadata, bearer?: keyof typeof TOKENS, reply = replyWith()): Promise<unknown> =>
    outcome(onRequest.generate(metadata)(requestFrom(bearer), reply as unknown as FastifyReply) as Promise<void>);

  beforeEach(() => {
    setConfig({ 'rate-limit.enabled': true, 'rate-limit.ip-allowlist': '', 'oauth.issuer': ISSUER });
    redis = new InMemoryRedis();
    const rateLimiter = new RateLimiterService(new FakeDatabaseService({ redis }));
    const keyService = { verify: (token: string) => TOKENS[token] ?? null } as unknown as KeyService;
    const serviceCaller = new ServiceCallerService(keyService);
    onRequest = new RateLimitMiddleware(rateLimiter, serviceCaller);
    onResponse = new M2MRateLimitMiddleware(rateLimiter, serviceCaller);
  });

  it('should charge a first-party service caller to its client budget and never to its address', async () => {
    await spend(IP_GENERAL_BUCKET, POD_IP, GENERAL_LIMIT);

    expect(await request(M2M_ROUTE, 'service')).toBe('served');
    expect(await counter(M2M_CLIENT_BUCKET, FORGE)).toBe(1);
    expect(await counter(IP_GENERAL_BUCKET, POD_IP)).toBe(GENERAL_LIMIT);
  });

  it('should refuse a service caller past its own budget and say when to retry', async () => {
    await spend(M2M_CLIENT_BUCKET, FORGE, M2M_CLIENT_LIMIT);
    const reply = replyWith();

    expect(AppError.is(await request(M2M_ROUTE, 'service', reply), AppErrorCode.SEC_001)).toBe(true);
    expect(reply.headers.get('retry-after')).toBe('30');
  });

  it('should keep refusing an unauthenticated caller from an address that spent its budget', async () => {
    await spend(IP_GENERAL_BUCKET, POD_IP, GENERAL_LIMIT);

    expect(AppError.is(await request(M2M_ROUTE), AppErrorCode.SEC_001)).toBe(true);
    expect(await counter(M2M_CLIENT_BUCKET, FORGE)).toBe(0);
  });

  it('should not take a user, expired or foreign-audience token for a service caller', async () => {
    await spend(IP_GENERAL_BUCKET, POD_IP, GENERAL_LIMIT);

    for (const bearer of ['user', 'expired', 'foreignAudience'] as const) expect(AppError.is(await request(M2M_ROUTE, bearer), AppErrorCode.SEC_001)).toBe(true);
    expect(await counter(M2M_CLIENT_BUCKET, FORGE)).toBe(0);
  });

  it('should keep charging human traffic to its address, whatever bearer it carries', async () => {
    expect(await request(HUMAN_ROUTE, 'service')).toBe('served');
    expect(await request(HUMAN_ROUTE)).toBe('served');

    expect(await counter(IP_GENERAL_BUCKET, POD_IP)).toBe(2);
    expect(await counter(M2M_CLIENT_BUCKET, FORGE)).toBe(0);
  });

  it('should charge a refused unauthenticated call to its address but not a refusal a service caller earned', async () => {
    const charge = (bearer: keyof typeof TOKENS | undefined, statusCode: number): Promise<void> =>
      onResponse.generate(M2M_ROUTE)?.(requestFrom(bearer), replyWith(statusCode) as unknown as FastifyReply) as Promise<void>;

    await charge('service', 403);
    expect(await counter(IP_GENERAL_BUCKET, POD_IP)).toBe(0);

    await charge(undefined, 401);
    await charge('user', 403);
    expect(await counter(IP_GENERAL_BUCKET, POD_IP)).toBe(2);
  });
});
