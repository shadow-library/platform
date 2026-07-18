/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { AUTH_ROUTE_METADATA } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';
import { type AsyncRouteHandler, Middleware, type MiddlewareGenerator } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { PUBLIC_ROUTE_METADATA } from './public.decorator';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * PULSE-SPECIFIC DELTA over `@shadow-library/auth/module`: the shared `AuthGuard` is opt-in per
 * route (it only attaches where an auth decorator wrote metadata), so a controller route added
 * without a decorator would be silently public. The SDK ships no default-deny layer, so this
 * sentinel is kept from the pre-migration guard stack: it fails such routes closed. Routes carrying
 * the shared `AUTH_ROUTE_METADATA` are handled by the SDK guard, and `@Public()` is the explicit
 * escape hatch. A route reaching this sentinel is a wiring defect, so it is logged at `warn` — once
 * when the route is registered (to surface the misconfiguration at boot) and again on every
 * rejected request.
 */

@Middleware({ type: 'preHandler', weight: 100 })
export class RouteGuardSentinel implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(APP_NAME, RouteGuardSentinel.name);

  /** Namespaced so the router's per-metadata handler cache never collides with the auth guard's entries */
  cacheKey(metadata: HandlerMetadata): string {
    return `pulse-sentinel:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    const isGuarded = metadata[AUTH_ROUTE_METADATA] !== undefined;
    const isPublic = metadata[PUBLIC_ROUTE_METADATA] === true;
    if (isGuarded || isPublic) return undefined;

    const route = `${String(metadata.method)} ${String(metadata.path)}`;
    this.logger.warn('Route declares no access policy; the default-deny sentinel will reject every request to it — add an auth decorator or @Public()', { route });
    return async (): Promise<void> => {
      this.logger.warn('Rejected request to a route with no declared access policy', { route });
      throw AppErrorCode.SEC_003.create();
    };
  }
}
