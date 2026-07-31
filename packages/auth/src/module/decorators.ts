/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

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
  elevated?: boolean;
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

const authRoute = (metadata: AuthRouteMetadata): AuthDecorator => Handler({ [AUTH_ROUTE_METADATA]: metadata });

/** Requires a valid bearer token; the resolved principal is exposed via `context.getAuthPrincipal()` */
export const Authenticated = (): AuthDecorator => authRoute({ authenticated: true });

/** Requires a valid bearer token carrying every listed scope */
export const RequireScope = (...scopes: string[]): AuthDecorator => authRoute({ authenticated: true, scopes });

/** Requires a PDP PERMIT for the action, checked in the principal's organisation (implies `@Authenticated`) */
export const RequirePermission = (permission: string, options: RequirePermissionOptions = {}): AuthDecorator => authRoute({ authenticated: true, permission, ...options });

/**
 * Requires an `AAL2` principal, minted from a step-up grant scoped to this application's audience
 * (D-19). For a browser session the SDK drives the whole cycle — claim, prompt if there is nothing to
 * claim, retry — while a bearer caller is answered with `IAM_003` so it can drive the cycle itself.
 *
 * Elevation is deliberately not contagious: the elevated token is minted for these routes only and
 * never attached to ordinary requests, so a user working across two applications steps up in each.
 */
export const RequireElevation = (...scopes: string[]): AuthDecorator => authRoute({ authenticated: true, elevated: true, ...(scopes.length > 0 && { scopes }) });
