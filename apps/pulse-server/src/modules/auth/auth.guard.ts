/**
 * Importing npm packages
 */
import { Inject, type RouteMetadata } from '@shadow-library/app';
import { type AuthClient, type AuthPrincipal } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';
import { Middleware, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { AUTH_CLIENT, AUTH_ROUTE_METADATA } from './auth.constants';
import { type AuthRouteMetadata, type PrincipalCarrier } from './auth.decorators';

/**
 * Defining types
 */

interface GuardedRequest extends PrincipalCarrier {
  headers: Record<string, string | string[] | undefined>;
}

type AuthGuardHandler = (request: GuardedRequest) => Promise<void>;

/**
 * Declaring the constants
 *
 * The guard only attaches to routes carrying auth metadata, so unguarded routes pay no cost. Every
 * failure maps to the same generic 401/403 pair — the response never reveals which check failed. The
 * verification and PDP logic is delegated to the SDK auth client; this class only bridges it into the
 * pulse HTTP pipeline. Rejections are logged at `debug` (they are routine client errors) and carry
 * sensitive detail — tokens, principal claims, PDP decisions — for local and lower-environment
 * debugging; `debug` is suppressed at production log levels, so that detail never reaches prod logs.
 */

@Middleware({ type: 'preHandler', weight: 100 })
export class AuthGuard {
  private readonly logger = Logger.getLogger(APP_NAME, AuthGuard.name);

  constructor(@Inject(AUTH_CLIENT) private readonly client: AuthClient) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with the sentinel */
  cacheKey(metadata: RouteMetadata): string {
    return `pulse-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: RouteMetadata): AuthGuardHandler | undefined {
    const auth = metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined;
    if (!auth?.authenticated) return undefined;

    const route = `${String(metadata.method)} ${String(metadata.path)}`;
    return async (request: GuardedRequest): Promise<void> => {
      this.logger.debug('Enforcing auth policy on route', { route, policy: auth });
      const principal = await this.authenticate(request, route);
      this.authorize(principal, auth, route);
      if (auth.permission) await this.checkPermission(principal, auth, route);
      request.authPrincipal = principal;
      this.logger.debug('Auth policy satisfied', { route, sub: principal.sub, kind: principal.kind, org: principal.org });
    };
  }

  private async authenticate(request: GuardedRequest, route: string): Promise<AuthPrincipal> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      this.logger.debug('Authentication rejected: request carried no bearer token', { route });
      throw new ServerError(AppErrorCode.SEC_001);
    }

    try {
      const principal = await this.client.verify(token);
      this.logger.debug('Bearer token verified', {
        route,
        sub: principal.sub,
        kind: principal.kind,
        org: principal.org,
        clientId: principal.clientId,
        scopes: principal.scopes,
        sid: principal.sid,
      });
      return principal;
    } catch (err) {
      /** The raw token is logged deliberately to aid local/lower-env debugging; suppressed at prod log levels. */
      this.logger.debug('Authentication rejected: bearer token verification failed', { route, reason: (err as Error).message, token });
      throw new ServerError(AppErrorCode.SEC_001);
    }
  }

  private authorize(principal: AuthPrincipal, auth: AuthRouteMetadata, route: string): void {
    if (auth.services && (principal.kind !== 'service' || !principal.clientId || !auth.services.includes(principal.clientId))) {
      this.logger.debug('Authorization rejected: caller is not an allowed service', { route, kind: principal.kind, clientId: principal.clientId, allowedServices: auth.services });
      throw new ServerError(AppErrorCode.SEC_002);
    }

    const missingScopes = auth.scopes?.filter(scope => !principal.scopes.includes(scope)) ?? [];
    if (missingScopes.length > 0) {
      this.logger.debug('Authorization rejected: token is missing required scopes', { route, sub: principal.sub, missingScopes, presentScopes: principal.scopes });
      throw new ServerError(AppErrorCode.SEC_002);
    }
  }

  private async checkPermission(principal: AuthPrincipal, auth: AuthRouteMetadata, route: string): Promise<void> {
    const action = auth.permission as string;

    if (!principal.org) {
      const permitted = auth.failOpen ?? false;
      this.logger.debug('Permission check short-circuited: principal carries no organisation', {
        route,
        action,
        sub: principal.sub,
        kind: principal.kind,
        failOpen: auth.failOpen,
        permitted,
      });
      if (!permitted) throw new ServerError(AppErrorCode.SEC_002);
      return;
    }

    this.logger.debug('Requesting permission decision from PDP', { route, action, sub: principal.sub, org: principal.org, failOpen: auth.failOpen });
    const permitted = await this.client.check({ action, organisationId: principal.org, principal }, { failOpen: auth.failOpen });
    this.logger.debug('PDP permission decision received', { route, action, sub: principal.sub, org: principal.org, permitted });
    if (!permitted) throw new ServerError(AppErrorCode.SEC_002);
  }
}
