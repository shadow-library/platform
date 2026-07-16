/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger, throwError } from '@shadow-library/common';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService } from '@server/modules/infrastructure/datastore';

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
