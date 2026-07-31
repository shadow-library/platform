/**
 * Importing npm packages
 */
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

import { M2M_CLIENT_BUCKET, M2M_CLIENT_LIMIT, M2M_CLIENT_WINDOW_SECONDS } from './security.constants';

/**
 * Defining types
 */

export interface RateDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Declaring the constants
 */

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

  /** Runtime kill-switch, initialised from config; mutable so operators and tests can flip it without a reboot. */
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
  }

  isAllowlisted(ip: string): boolean {
    return this.allowlist.has(ip);
  }

  /** Counts a hit against `bucket:key` and reports whether the caller is still within budget. */
  async consume(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    if (!this.enabled) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
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

  /**
   * Reports a counter's standing without counting a hit against it. M2M routes read the IP tier this
   * way so an authenticated fleet never spends it, while a caller that has already flooded past the
   * limit is still turned away before the handler runs.
   */
  async peek(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateDecision> {
    if (!this.enabled) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    const redisKey = `rl:${bucket}:${key}`;
    const [count, ttl] = await Promise.all([this.redis.get(redisKey), this.redis.ttl(redisKey)]);
    const hits = Number(count ?? 0);
    return { allowed: hits < limit, remaining: Math.max(0, limit - hits), retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }

  /**
   * Charges one M2M call to the client that made it, once its credential has been proven. Callers
   * invoke this at the point of authentication, so an unauthenticated request can never reach a
   * client's budget — nor spend another client's.
   */
  async consumeClientBudget(clientId: string): Promise<void> {
    const decision = await this.consume(M2M_CLIENT_BUCKET, clientId, M2M_CLIENT_LIMIT, M2M_CLIENT_WINDOW_SECONDS);
    if (decision.allowed) return;
    this.logger.warn('M2M client exceeded its request budget', { securityEvent: 'security.client_rate_limited', clientId });
    throw AppErrorCode.SEC_001.create();
  }

  /** Temporarily denies every request from the IP; used by failure correlation and incident response. */
  async blockIp(ip: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`rl:ipblock:${ip}`, '1', 'EX', ttlSeconds);
    this.logger.warn('IP address blocked', { securityEvent: 'security.ip_blocked', ip, ttlSeconds });
  }

  async unblockIp(ip: string): Promise<void> {
    await this.redis.del(`rl:ipblock:${ip}`);
  }

  /** Returns the remaining block duration in seconds, or 0 when the IP is not blocked. */
  async getIpBlockTtl(ip: string): Promise<number> {
    const ttl = await this.redis.ttl(`rl:ipblock:${ip}`);
    return ttl > 0 ? ttl : 0;
  }
}
