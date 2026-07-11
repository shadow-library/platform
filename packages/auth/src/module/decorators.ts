/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthPrincipal } from '../interfaces';
import { AUTH_ROUTE_METADATA } from './constants';
import { AuthGuardErrorCode } from './errors';

/**
 * Defining types
 */

export interface AuthRouteMetadata {
  authenticated: true;
  scopes?: string[];
  services?: string[];
  permission?: string;
  failOpen?: boolean;
}

export interface PrincipalCarrier {
  authPrincipal?: AuthPrincipal;
}

export interface RequirePermissionOptions {
  /** Permits the action when the PDP is unreachable — explicit opt-in for availability-critical read paths */
  failOpen?: boolean;
}

type AuthDecorator = ClassDecorator & MethodDecorator;

/**
 * Declaring the constants
 */

const authRoute = (metadata: AuthRouteMetadata): AuthDecorator => Route({ [AUTH_ROUTE_METADATA]: metadata });

/** Requires a valid bearer token; the resolved principal is attached to the request */
export const Authenticated = (): AuthDecorator => authRoute({ authenticated: true });

/** Requires a valid bearer token carrying every listed scope */
export const RequireScope = (...scopes: string[]): AuthDecorator => authRoute({ authenticated: true, scopes });

/** Restricts the route to M2M callers: `kind=service` and a client id in the allowlist */
export const AllowService = (...services: string[]): AuthDecorator => authRoute({ authenticated: true, services });

/** Requires a PDP PERMIT for the action, checked in the principal's organisation (implies `@Authenticated`) */
export const RequirePermission = (permission: string, options: RequirePermissionOptions = {}): AuthDecorator => authRoute({ authenticated: true, permission, ...options });

/** Returns the principal the guard attached to the request; throws 401 when the route ran unauthenticated */
export function getPrincipal(request: PrincipalCarrier): AuthPrincipal {
  const principal = request.authPrincipal;
  if (!principal) throw new ServerError(AuthGuardErrorCode.IAM_001);
  return principal;
}
