/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AUTH_ROUTE_METADATA } from './constants';

/**
 * Defining types
 */

export interface AuthRouteMetadata {
  authenticated: true;
  scopes?: string[];
  permission?: string;
  failOpen?: boolean;
  highRisk?: boolean;
}

export interface RequirePermissionOptions {
  /** Permits the action when the PDP is unreachable — explicit opt-in for availability-critical read paths */
  failOpen?: boolean;

  /** Caches this route's PDP decision for ~60 s instead of the default 15 min — for sensitive operations that need fast revocation */
  highRisk?: boolean;
}

type AuthDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 *
 * There is deliberately no per-route service allowlist decorator: which M2M callers may reach
 * which routes is administered centrally in the identity admin panel and loaded by `AuthModule`
 * at startup, so route code never hard-codes caller identities.
 */

const authRoute = (metadata: AuthRouteMetadata): AuthDecorator => Route({ [AUTH_ROUTE_METADATA]: metadata });

/** Requires a valid bearer token; the resolved principal is exposed via `context.getAuthPrincipal()` */
export const Authenticated = (): AuthDecorator => authRoute({ authenticated: true });

/** Requires a valid bearer token carrying every listed scope */
export const RequireScope = (...scopes: string[]): AuthDecorator => authRoute({ authenticated: true, scopes });

/** Requires a PDP PERMIT for the action, checked in the principal's organisation (implies `@Authenticated`) */
export const RequirePermission = (permission: string, options: RequirePermissionOptions = {}): AuthDecorator => authRoute({ authenticated: true, permission, ...options });
