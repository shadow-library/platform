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
import { APP_NAME } from '@server/constants';

import { M2M_BUDGET_METADATA } from './m2m-budget.decorator';
import { RateLimiterService } from './rate-limiter.service';
import { GENERAL_LIMIT, GENERAL_WINDOW_SECONDS, IP_GENERAL_BUCKET } from './security.constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Statuses that mean the caller never proved a client identity, so the request belongs to the IP
 * tier rather than to any client's budget.
 */
const UNAUTHENTICATED_STATUSES = new Set([401, 403]);

/**
 * The second half of the per-client M2M budget (T-804). `RateLimitMiddleware` only *reads* the IP
 * counter on a route marked `@M2MBudget()`, so something has to count the requests that never reach
 * a client budget — otherwise the IP tier would be free on exactly the endpoints an attacker floods
 * without credentials. Running at `onResponse` is what makes the outcome knowable: authentication
 * happens in a guard or a service, long after `onRequest`.
 *
 * Failures here are swallowed. The response has already been sent, and losing one accounting hit is
 * a better outcome than an error on a completed request; the request that *starts* a flood is
 * refused by the read at `onRequest`, which does fail closed.
 */
@Middleware({ type: 'onResponse', weight: 95 })
export class M2MRateLimitMiddleware implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, M2MRateLimitMiddleware.name);

  constructor(private readonly rateLimiter: RateLimiterService) {}

  /** Namespaced so the router's metadata-keyed handler cache cannot share this with another generator. */
  cacheKey(metadata: HandlerMetadata): string {
    return `m2m-rate-limit:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    if (metadata[M2M_BUDGET_METADATA] !== true) return undefined;

    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!this.rateLimiter.enabled) return;
      if (!UNAUTHENTICATED_STATUSES.has(reply.statusCode)) return;
      const ip = request.ip || 'unknown';
      if (this.rateLimiter.isAllowlisted(ip)) return;

      await this.rateLimiter
        .consume(IP_GENERAL_BUCKET, ip, GENERAL_LIMIT, GENERAL_WINDOW_SECONDS)
        .catch((error: unknown) => this.logger.error('Failed to charge an unauthenticated M2M request to its source IP', { error, ip }));
    };
  }
}
