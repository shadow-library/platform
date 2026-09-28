import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

import {
  M2M_CLIENT_BUCKETS,
  M2M_CLIENT_WINDOW_SECONDS,
  type M2MBudgetClass,
  OAUTH_PUBLIC_CLIENT_BUCKET,
  OAUTH_PUBLIC_CLIENT_LIMIT,
  OAUTH_PUBLIC_CLIENT_WINDOW_SECONDS,
  USERINFO_SUBJECT_BUCKET,
  USERINFO_SUBJECT_WINDOW_SECONDS,
} from './security.constants';

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Redis-backed fixed-window counters for the tiered abuse controls (architecture §13.2), plus the
 * dynamic IP deny list that the security correlation layer and operators feed. Counters are
 * window-scoped keys, so a Redis flush only ever loosens limits — state loss fails open by design
 * while the middleware decides per-route whether a Redis *error* fails open or closed.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = Logger.getLogger(APP_NAME, RateLimiterService.name);
  private readonly redis: Redis;
  private readonly allowlist: Set<string>;
  private readonly clientLimits: Record<M2MBudgetClass, number>;
  private readonly userInfoLimit: number;

  enabled: boolean;

  constructor(databaseService: DatabaseService) {
    this.redis = databaseService.getRedisClient();
    this.enabled = Config.get('rate-limit.enabled');
    this.allowlist = new Set(
      Config.get('rate-limit.ip-allowlist')
        .split(',')
        .map(ip => ip.trim())
        .filter(Boolean),
    );
    this.clientLimits = { session: Config.get('rate-limit.m2m.session-limit'), authz: Config.get('rate-limit.m2m.authz-limit') };
    this.userInfoLimit = Config.get('rate-limit.userinfo.subject-limit');
  }

  isAllowlisted(ip: string): boolean {
    return this.allowlist.has(ip);
  }

  async consume(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    if (!this.enabled) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    return this.enforce(bucket, key, limit, windowSeconds);
  }

  /** Counts against a product quota rather than an abuse control, so the `rate-limit.enabled` kill switch does not lift it. */
  async enforce(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    const redisKey = `rl:${bucket}:${key}`;
    const results =
      (await this.redis.multi().incr(redisKey).call('EXPIRE', redisKey, windowSeconds, 'NX').ttl(redisKey).exec()) ??
      throwError(AppError.internal('Rate limit transaction aborted'));

    const [countResult, , ttlResult] = results;
    const count = Number(countResult?.[1] ?? 0);
    const ttl = Number(ttlResult?.[1] ?? windowSeconds);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
  }

  async peek(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    if (!this.enabled) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    const redisKey = `rl:${bucket}:${key}`;
    const [count, ttl] = await Promise.all([this.redis.get(redisKey), this.redis.ttl(redisKey)]);
    const hits = Number(count ?? 0);
    return { allowed: hits < limit, remaining: Math.max(0, limit - hits), retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }

  /** The caller refuses a disallowed decision itself, because only it can reach the reply that must carry `Retry-After`. */
  async consumeClientBudget(clientId: string, budget: M2MBudgetClass): Promise<RateDecision> {
    const decision = await this.consume(M2M_CLIENT_BUCKETS[budget], clientId, this.clientLimits[budget], M2M_CLIENT_WINDOW_SECONDS);
    if (!decision.allowed) this.logger.warn('M2M client exceeded its request budget', { securityEvent: 'security.client_rate_limited', clientId, budget });
    return decision;
  }

  async consumeUserInfoBudget(clientId: string, subject: string): Promise<RateDecision> {
    const decision = await this.consume(USERINFO_SUBJECT_BUCKET, `${clientId}:${subject}`, this.userInfoLimit, USERINFO_SUBJECT_WINDOW_SECONDS);
    if (!decision.allowed) this.logger.warn('userinfo budget exceeded for a user token', { securityEvent: 'security.userinfo_rate_limited', clientId, subject });
    return decision;
  }

  async consumePublicClientBudget(clientId: string, ip: string): Promise<RateDecision> {
    const decision = await this.consume(OAUTH_PUBLIC_CLIENT_BUCKET, `${clientId}:${ip}`, OAUTH_PUBLIC_CLIENT_LIMIT, OAUTH_PUBLIC_CLIENT_WINDOW_SECONDS);
    if (!decision.allowed) this.logger.warn('public OAuth client request budget exceeded for source', { securityEvent: 'security.public_client_rate_limited', clientId, ip });
    return decision;
  }

  async blockIp(ip: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`rl:ipblock:${ip}`, '1', 'EX', ttlSeconds);
    this.logger.warn('IP address blocked', { securityEvent: 'security.ip_blocked', ip, ttlSeconds });
  }

  async unblockIp(ip: string): Promise<void> {
    await this.redis.del(`rl:ipblock:${ip}`);
  }

  async getIpBlockTtl(ip: string): Promise<number> {
    const ttl = await this.redis.ttl(`rl:ipblock:${ip}`);
    return ttl > 0 ? ttl : 0;
  }
}
