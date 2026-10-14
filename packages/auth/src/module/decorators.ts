/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';
import { Reflector } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';
import { AUTH_ROUTE_METADATA } from './constants';

/**
 * Defining types
 */

export type AuthRouteAccess = 'public' | 'optional' | 'required';

export interface PublicAuthRoute {
  access: 'public';
}

export interface OptionalAuthRoute {
  access: 'optional';
}

export interface RequiredAuthRoute {
  access: 'required';
  scopes?: string[];
  permission?: string;
  failOpen?: boolean;
  highRisk?: boolean;
  elevated?: boolean;
  /** Every permission a bot must hold on this route; class- and method-level `@BotPermission` accumulate, as `scopes` do */
  botPermissions?: string[];
}

export type AuthRouteMetadata = PublicAuthRoute | OptionalAuthRoute | RequiredAuthRoute;

export interface RequirePermissionOptions {
  /** Permits the action when the PDP is unreachable — explicit opt-in for availability-critical read paths */
  failOpen?: boolean;

  /** Caches this route's PDP decision for ~60 s instead of the default 15 min — for sensitive operations that need fast revocation */
  highRisk?: boolean;
}

type AuthDecorator = ClassDecorator & MethodDecorator;

type DecoratorFunction = (target: object, propertyKey?: string | symbol, descriptor?: TypedPropertyDescriptor<any>) => void;

/**
 * Declaring the constants
 *
 * There is deliberately no per-route service allowlist decorator: which M2M callers may reach
 * which routes is administered centrally in the identity admin panel and loaded by `AuthModule`
 * at startup, so route code never hard-codes caller identities.
 *
 * The framework deep-merges a class's handler metadata under each method's, so a method's `access`
 * overrides its class's while `scopes` and `botPermissions` accumulate across both. Two decorators on
 * the same target merge last-applied-wins, which would let `@Public()` and `@Authenticated()` on one
 * method resolve by source order; each target therefore remembers the access it declared and refuses
 * a second, different one.
 */
const DECLARED_ACCESS = Symbol('shadow-library:auth-declared-access');

const authRoute =
  (metadata: AuthRouteMetadata): DecoratorFunction =>
  (target, propertyKey, descriptor): void => {
    const declaringTarget = descriptor?.value ?? target;
    const declared = Reflector.getOwnMetadata(DECLARED_ACCESS, declaringTarget) as AuthRouteAccess | undefined;
    if (declared && declared !== metadata.access) {
      const name = propertyKey ? String(propertyKey) : (target as { name?: string }).name;
      throw AuthErrorCode.CONFIG_INVALID.create({ reason: `'${name}' is declared both '${declared}' and '${metadata.access}'` });
    }

    Reflector.defineMetadata(DECLARED_ACCESS, metadata.access, declaringTarget);
    (Handler({ [AUTH_ROUTE_METADATA]: metadata }) as DecoratorFunction)(target, propertyKey, descriptor);
  };

/** Never authenticated, in either access mode — health checks, and the SDK's own sign-in surface */
export const Public = (): AuthDecorator => authRoute({ access: 'public' });

/**
 * Anonymous callers are served, and a presented credential is resolved best-effort so the handler can
 * tailor what it returns: a bad or absent one reads as anonymous, never as a 401, and a bot key is
 * never exchanged. In `private` mode the route requires a session like any other.
 */
export const OptionalAuth = (): AuthDecorator => authRoute({ access: 'optional' });

/** Requires a valid bearer token; the resolved principal is exposed via `context.getAuthPrincipal()` */
export const Authenticated = (): AuthDecorator => authRoute({ access: 'required' });

/** Requires a valid bearer token carrying every listed scope */
export const RequireScope = (...scopes: string[]): AuthDecorator => authRoute({ access: 'required', scopes });

/** Requires a PDP PERMIT for the action, checked in the principal's organisation (implies `@Authenticated`) */
export const RequirePermission = (permission: string, options: RequirePermissionOptions = {}): AuthDecorator => authRoute({ access: 'required', permission, ...options });

/**
 * Requires an `AAL2` principal, minted from a step-up grant scoped to this application's audience
 * (D-19). For a browser session the SDK drives the whole cycle — claim, prompt if there is nothing to
 * claim, retry — while a bearer caller is answered with `IAM_003` so it can drive the cycle itself.
 *
 * Elevation is deliberately not contagious: the elevated token is minted for these routes only and
 * never attached to ordinary requests, so a user working across two applications steps up in each.
 */
export const RequireElevation = (...scopes: string[]): AuthDecorator => authRoute({ access: 'required', elevated: true, ...(scopes.length > 0 && { scopes }) });

/**
 * Admits bot principals to the route, provided the PDP permits `permission` in the bot's organisation
 * (implies `@Authenticated`). Without it every bot is refused, whatever else the route declares. It is
 * evaluated for bots only — people and services on the same route are unaffected — and repeated
 * across class and method it accumulates: the bot must hold every one.
 */
export const BotPermission = (permission: string): AuthDecorator => {
  if (!permission) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'a bot permission must name a permission' });
  return authRoute({ access: 'required', botPermissions: [permission] });
};
