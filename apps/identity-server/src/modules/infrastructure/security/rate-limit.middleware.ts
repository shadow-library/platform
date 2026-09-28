import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type HandlerMetadata } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { M2M_BUDGET_METADATA } from './m2m-budget.decorator';
import { RATE_LIMIT_METADATA, RateLimitPolicy } from './rate-limit.decorator';
import { RateDecision, RateLimiterService } from './rate-limiter.service';
import { GENERAL_LIMIT, GENERAL_WINDOW_SECONDS, IP_GENERAL_BUCKET, type M2MBudgetClass } from './security.constants';
import { ServiceCallerService } from './service-caller.service';

@Middleware({ type: 'onRequest', weight: 95 })
export class RateLimitMiddleware implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, RateLimitMiddleware.name);

  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly serviceCaller: ServiceCallerService,
  ) {}

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
    const m2mBudget = metadata[M2M_BUDGET_METADATA] as M2MBudgetClass | undefined;
    const isM2M = m2mBudget !== undefined;

    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!this.rateLimiter.enabled) return;
      const ip = request.ip || 'unknown';
      if (this.rateLimiter.isAllowlisted(ip)) return;

      const failClosed = Boolean(policy) || isM2M;
      const blockTtl = await this.guarded(() => this.rateLimiter.getIpBlockTtl(ip), failClosed);
      if (blockTtl) return this.reject(reply, blockTtl);

      const serviceClientId = isM2M ? this.serviceCaller.clientIdOf(request) : null;
      if (serviceClientId && m2mBudget) {
        const budget = await this.guarded(() => this.rateLimiter.consumeClientBudget(serviceClientId, m2mBudget), true);
        if (budget && !budget.allowed) return this.reject(reply, budget.retryAfterSeconds);
        return;
      }

      const chargeIp = isM2M ? this.rateLimiter.peek.bind(this.rateLimiter) : this.rateLimiter.consume.bind(this.rateLimiter);
      const general = await this.guarded(() => chargeIp(IP_GENERAL_BUCKET, ip, GENERAL_LIMIT, GENERAL_WINDOW_SECONDS), failClosed);
      if (general && !general.allowed) return this.reject(reply, general.retryAfterSeconds);
      if (!policy) return;

      const scoped = await this.guarded(() => this.rateLimiter.consume(policy.name, ip, policy.limit, policy.windowSeconds), true);
      if (scoped && !scoped.allowed) return this.reject(reply, scoped.retryAfterSeconds);
    };
  }

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
