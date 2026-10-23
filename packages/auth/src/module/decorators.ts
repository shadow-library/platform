import { Handler } from '@shadow-library/app';
import { Reflector } from '@shadow-library/common';

import { AuthErrorCode } from '../errors';
import { AUTH_ROUTE_METADATA } from './constants';

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

// Handler metadata deep-merges class under method (method `access` wins, `scopes` and `botPermissions` accumulate) and two decorators on one target merge
// last-applied-wins, so each target remembers its declared access and refuses a different second one rather than resolve by source order.
// There is deliberately no per-route service allowlist decorator: M2M access is administered centrally in identity and loaded by `AuthModule`.
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

/** A presented credential is resolved best-effort: a bad or absent one reads as anonymous, never 401, and a bot key is never exchanged; `private` mode requires a session */
export const OptionalAuth = (): AuthDecorator => authRoute({ access: 'optional' });

/** Requires a valid bearer token; the resolved principal is exposed via `context.getAuthPrincipal()` */
export const Authenticated = (): AuthDecorator => authRoute({ access: 'required' });

/** Requires a valid bearer token carrying every listed scope */
export const RequireScope = (...scopes: string[]): AuthDecorator => authRoute({ access: 'required', scopes });

/** Requires a PDP PERMIT for the action, checked in the principal's organisation (implies `@Authenticated`) */
export const RequirePermission = (permission: string, options: RequirePermissionOptions = {}): AuthDecorator => authRoute({ access: 'required', permission, ...options });

/**
 * Requires an `AAL2` principal minted from a step-up grant scoped to this application's audience. Browser sessions are driven through claim, prompt and retry by the SDK;
 * bearer callers get `IAM_003` to drive the cycle themselves. The elevated token is never attached to ordinary requests
 */
export const RequireElevation = (...scopes: string[]): AuthDecorator => authRoute({ access: 'required', elevated: true, ...(scopes.length > 0 && { scopes }) });

/** Without it every bot is refused; evaluated for bots only, implies `@Authenticated`, and accumulates across class and method so the bot must hold every one */
export const BotPermission = (permission: string): AuthDecorator => {
  if (!permission) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'a bot permission must name a permission' });
  return authRoute({ access: 'required', botPermissions: [permission] });
};
