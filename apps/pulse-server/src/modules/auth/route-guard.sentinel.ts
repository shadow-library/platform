/**
 * Importing npm packages
 */
import { type RouteMetadata } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { type AsyncRouteHandler, Middleware, type MiddlewareGenerator, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { AUTH_ROUTE_METADATA } from './auth.constants';
import { PUBLIC_ROUTE_METADATA } from './public.decorator';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Default-deny safety net. The auth guard is opt-in per route, so a controller route added without an
 * auth decorator would otherwise be silently public; this middleware fails such routes closed. Routes
 * carrying auth metadata are handled by the auth guard, and `@Public()` is the explicit escape hatch.
 * A route reaching this sentinel is a wiring defect, so it is logged at `warn` — once when the route
 * is registered (to surface the misconfiguration at boot) and again on every rejected request.
 */

@Middleware({ type: 'preHandler', weight: 100 })
export class RouteGuardSentinel implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, RouteGuardSentinel.name);

  /** Namespaced so the router's per-metadata handler cache never collides with the auth guard's entries */
  cacheKey(metadata: RouteMetadata): string {
    return `pulse-sentinel:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: RouteMetadata): AsyncRouteHandler | undefined {
    const isGuarded = metadata[AUTH_ROUTE_METADATA] !== undefined;
    const isPublic = metadata[PUBLIC_ROUTE_METADATA] === true;
    if (isGuarded || isPublic) return undefined;

    const route = `${String(metadata.method)} ${String(metadata.path)}`;
    this.logger.warn('Route declares no access policy; the default-deny sentinel will reject every request to it — add an auth decorator or @Public()', { route });
    return async (): Promise<void> => {
      this.logger.warn('Rejected request to a route with no declared access policy', { route });
      throw new ServerError(AppErrorCode.SEC_003);
    };
  }
}
