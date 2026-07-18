/**
 * Importing npm packages
 */
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { RATE_LIMIT_METADATA, RateLimitPolicy } from './rate-limit.decorator';
import { RateDecision, RateLimiterService } from './rate-limiter.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The general budget (Tier-1 baseline, architecture §13.2) applies to every route; decorated
 * routes add their own tighter budget. Runs at `onRequest` so rejected floods never reach body
 * parsing, and before the CSRF middleware (weight 90).
 */
const GENERAL_LIMIT = 100;
const GENERAL_WINDOW_SECONDS = 60;

@Middleware({ type: 'onRequest', weight: 95 })
export class RateLimitMiddleware implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, RateLimitMiddleware.name);

  constructor(private readonly rateLimiter: RateLimiterService) {}

  /**
   * The router caches generated handlers by metadata alone, so two generating middlewares on the
   * same route would otherwise collide and share one handler; namespacing the key keeps this
   * middleware's handlers distinct from the http-core CSRF generator's.
   */
  cacheKey(metadata: HandlerMetadata): string {
    return `rate-limit:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler {
    const policy = metadata[RATE_LIMIT_METADATA] as RateLimitPolicy | undefined;

    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!this.rateLimiter.enabled) return;
      const ip = request.ip || 'unknown';
      if (this.rateLimiter.isAllowlisted(ip)) return;

      const failClosed = Boolean(policy);
      const blockTtl = await this.guarded(() => this.rateLimiter.getIpBlockTtl(ip), failClosed);
      if (blockTtl) return this.reject(reply, blockTtl);

      const general = await this.guarded(() => this.rateLimiter.consume('ip-general', ip, GENERAL_LIMIT, GENERAL_WINDOW_SECONDS), failClosed);
      if (general && !general.allowed) return this.reject(reply, general.retryAfterSeconds);
      if (!policy) return;

      const scoped = await this.guarded(() => this.rateLimiter.consume(policy.name, ip, policy.limit, policy.windowSeconds), true);
      if (scoped && !scoped.allowed) return this.reject(reply, scoped.retryAfterSeconds);
    };
  }

  /**
   * Wraps a Redis-backed check: the authentication surface (decorated routes) fails closed on a
   * backend error, everything else degrades to unlimited rather than unavailable.
   */
  private async guarded<T extends RateDecision | number>(check: () => Promise<T>, failClosed: boolean): Promise<T | null> {
    try {
      return await check();
    } catch (error) {
      this.logger.error('Rate limit backend unavailable', { error });
      if (failClosed) throw AppErrorCode.SEC_002.create();
      return null;
    }
  }

  private reject(reply: FastifyReply, retryAfterSeconds: number): never {
    reply.header('retry-after', String(retryAfterSeconds));
    throw AppErrorCode.SEC_001.create();
  }
}
