/**
 * Importing npm packages
 */
import { Inject } from '@shadow-library/app';
import { type RouteMetadata } from '@shadow-library/app';
import { Middleware, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthPrincipal } from '../interfaces';
import { AUTH_CLIENT, AUTH_ROUTE_METADATA } from './constants';
import { AuthRouteMetadata, PrincipalCarrier } from './decorators';
import { AuthGuardErrorCode } from './errors';
import { type AuthClient } from '../lib/auth-client';

/**
 * Defining types
 */

export interface GuardedRequest extends PrincipalCarrier {
  headers: Record<string, string | string[] | undefined>;
}

export type AuthGuardHandler = (request: GuardedRequest) => Promise<void>;

/**
 * Declaring the constants
 *
 * The guard only attaches to routes that carry auth metadata, so unguarded routes pay no cost.
 * Every failure is deliberately mapped to the same generic 401/403 pair — the response never
 * explains which check failed, only the audit-friendly error code differs.
 */

@Middleware({ type: 'preHandler', weight: 100 })
export class AuthGuard {
  constructor(@Inject(AUTH_CLIENT) private readonly client: AuthClient) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with other generating middlewares on the same route */
  cacheKey(metadata: RouteMetadata): string {
    return `shadow-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: RouteMetadata): AuthGuardHandler | undefined {
    const auth = metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined;
    if (!auth?.authenticated) return undefined;

    return async (request: GuardedRequest): Promise<void> => {
      const principal = await this.authenticate(request);
      this.authorize(principal, auth);
      if (auth.permission) await this.checkPermission(principal, auth);
      request.authPrincipal = principal;
    };
  }

  private async authenticate(request: GuardedRequest): Promise<AuthPrincipal> {
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new ServerError(AuthGuardErrorCode.IAM_001);
    return this.client.verify(token).catch(() => {
      throw new ServerError(AuthGuardErrorCode.IAM_001);
    });
  }

  private authorize(principal: AuthPrincipal, auth: AuthRouteMetadata): void {
    if (auth.services && (principal.kind !== 'service' || !principal.clientId || !auth.services.includes(principal.clientId))) throw new ServerError(AuthGuardErrorCode.IAM_002);
    if (auth.scopes?.some(scope => !principal.scopes.includes(scope))) throw new ServerError(AuthGuardErrorCode.IAM_002);
  }

  private async checkPermission(principal: AuthPrincipal, auth: AuthRouteMetadata): Promise<void> {
    const permission = auth.permission as string;
    const options = { failOpen: auth.failOpen, highRisk: auth.highRisk };
    const permitted = principal.org ? await this.client.check({ action: permission, organisationId: principal.org, principal }, options) : (auth.failOpen ?? false);
    if (!permitted) throw new ServerError(AuthGuardErrorCode.IAM_002);
  }
}
