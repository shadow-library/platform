/**
 * Importing npm packages
 */
import { type RouteMetadata } from '@shadow-library/app';
import { ContextService, Middleware, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthPrincipal } from '../interfaces';
import { AUTH_ROUTE_METADATA } from './constants';
import { AUTH_PRINCIPAL } from './context';
import { AuthRouteMetadata } from './decorators';
import { AuthGuardErrorCode } from './errors';
import { AuthClient } from '../lib/auth-client';

/**
 * Defining types
 */

export interface GuardedRequest {
  headers: Record<string, string | string[] | undefined>;
}

export type AuthGuardHandler = (request: GuardedRequest) => Promise<void>;

/**
 * Declaring the constants
 *
 * The guard only attaches to routes that carry auth metadata, so unguarded routes pay no cost.
 * Every failure is deliberately mapped to the same generic 401/403 pair — the response never
 * explains which check failed, only the audit-friendly error code differs. M2M callers are
 * deny-by-default: a service token passes only when an admin-configured service-access rule
 * (loaded from identity at startup) covers this route for that caller.
 */

@Middleware({ type: 'preHandler', weight: 100 })
export class AuthGuard {
  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
  ) {}

  /** The router caches generated handlers by metadata alone; namespacing avoids colliding with other generating middlewares on the same route */
  cacheKey(metadata: RouteMetadata): string {
    return `shadow-auth:${String(metadata.method)}:${String(metadata.path)}`;
  }

  generate(metadata: RouteMetadata): AuthGuardHandler | undefined {
    const auth = metadata[AUTH_ROUTE_METADATA] as AuthRouteMetadata | undefined;
    if (!auth?.authenticated) return undefined;

    const method = String(metadata.method ?? '*');
    const path = String(metadata.path ?? '/');
    return async (request: GuardedRequest): Promise<void> => {
      const principal = await this.authenticate(request);
      this.authorize(principal, auth, method, path);
      if (auth.permission) await this.checkPermission(principal, auth);
      this.context.set(AUTH_PRINCIPAL, principal);
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

  private authorize(principal: AuthPrincipal, auth: AuthRouteMetadata, method: string, path: string): void {
    if (principal.kind === 'service' && (!principal.clientId || !this.client.isServiceCallerAllowed(principal.clientId, method, path))) {
      throw new ServerError(AuthGuardErrorCode.IAM_002);
    }
    if (auth.scopes?.some(scope => !principal.scopes.includes(scope))) throw new ServerError(AuthGuardErrorCode.IAM_002);
  }

  private async checkPermission(principal: AuthPrincipal, auth: AuthRouteMetadata): Promise<void> {
    const permission = auth.permission as string;
    const options = { failOpen: auth.failOpen, highRisk: auth.highRisk };
    const permitted = principal.org ? await this.client.check({ action: permission, organisationId: principal.org, principal }, options) : (auth.failOpen ?? false);
    if (!permitted) throw new ServerError(AuthGuardErrorCode.IAM_002);
  }
}
