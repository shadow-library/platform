import { type HandlerMetadata } from '@shadow-library/app';
import { AUTH_ROUTE_METADATA, type AuthRouteMetadata } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';
import { type AsyncRouteHandler, ContextService, Middleware, type MiddlewareGenerator } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { PUBLIC_ROUTE_METADATA } from './public.decorator';

/**
 * In the SDK's `public` access mode a controller route without a decorator is silently anonymous, so this sentinel fails undeclared routes closed.
 * Guarded routes also refuse bot principals: the SDK already denies bots without `@BotPermission`, and this keeps pulse closed if one is added by mistake.
 */
@Middleware({ type: 'preHandler', weight: 100 })
export class RouteGuardSentinel implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, RouteGuardSentinel.name);

  constructor(private readonly context: ContextService) {}

  /** Namespaced so the router's handler cache never collides with the auth guard's entries. */
  cacheKey(metadata: HandlerMetadata): string {
    return `pulse-sentinel:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    const route = `${String(metadata.method)} ${String(metadata.path)}`;
    const access = (metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined)?.access;
    if (access === 'optional' || access === 'required') return this.refuseBots(route);
    if (access === 'public' || metadata[PUBLIC_ROUTE_METADATA] === true) return undefined;

    this.logger.warn('Route declares no access policy; the default-deny sentinel will reject every request to it — add an auth decorator or @Public()', { route });
    return async (): Promise<void> => {
      this.logger.warn('Rejected request to a route with no declared access policy', { route });
      throw AppErrorCode.SEC_003.create();
    };
  }

  private refuseBots(route: string): AsyncRouteHandler {
    return async (): Promise<void> => {
      const principal = this.context.getAuthPrincipalOrNull();
      if (principal?.kind !== 'bot') return;
      this.logger.warn('Rejected a bot principal; pulse exposes no route to bots', { route, botId: principal.botId });
      throw AppErrorCode.SEC_003.create();
    };
  }
}
