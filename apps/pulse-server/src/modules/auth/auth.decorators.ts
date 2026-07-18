/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { AUTH_ROUTE_METADATA } from './auth.constants';

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
 *
 * The decorators are pulse-native (they write metadata through pulse's own `Route`) rather than the
 * SDK's framework module, so all route/controller metadata lives in a single framework instance. The
 * SDK is consumed only through its framework-free functional core (`createAuthClient`).
 */

const logger = Logger.getLogger(APP_NAME, 'AuthDecorators');

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
  if (!principal) {
    logger.debug('getPrincipal called on a request with no attached principal — is the route missing an auth decorator?');
    throw new ServerError(AppErrorCode.SEC_001);
  }
  return principal;
}
