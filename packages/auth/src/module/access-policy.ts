/**
 * Importing npm packages
 */
import { type HandlerMetadata } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';
import { type AuthAccessMode } from '../interfaces';
import { AUTH_ROUTE_METADATA } from './constants';
import { type AuthRouteAccess, type AuthRouteMetadata, type RequiredAuthRoute } from './decorators';

/**
 * Defining types
 */

type DeclaredAuthRoute = Partial<Omit<RequiredAuthRoute, 'access'>> & { access?: unknown };

/**
 * Declaring the constants
 *
 * A route's declared access is merged from its class and its method before anything reads it, so a
 * method-level `@Public()` under a class-level `@RequireScope()` arrives as `public` still carrying
 * the class's scopes. Which of the two was meant cannot be told from the merged value, so the route
 * is refused at registration rather than served either way.
 */
const ROUTE_ACCESS: readonly AuthRouteAccess[] = ['public', 'optional', 'required'];
const REQUIREMENTS: readonly (keyof DeclaredAuthRoute)[] = ['scopes', 'permission', 'failOpen', 'highRisk', 'elevated', 'botPermissions'];

const describeRoute = (route: HandlerMetadata): string => `${String(route.method ?? '*')} ${String(route.path ?? '/')}`;

/**
 * The access a route is actually served with in `mode`. An undecorated route follows the mode —
 * anonymous when `public`, a plain session requirement when `private` — and `@OptionalAuth()` is
 * promoted to that requirement in `private` mode; `@Public()` and the requiring decorators mean the
 * same thing in both.
 */
export function resolveRoutePolicy(route: HandlerMetadata, mode: AuthAccessMode): AuthRouteMetadata {
  const declared = route[AUTH_ROUTE_METADATA] as DeclaredAuthRoute | undefined;
  if (!declared) return mode === 'private' ? { access: 'required' } : { access: 'public' };

  const access = ROUTE_ACCESS.find(value => value === declared.access);
  if (!access) throw AuthErrorCode.CONFIG_INVALID.create({ reason: `${describeRoute(route)} declares an unknown access '${String(declared.access)}'` });
  if (access === 'required') return declared as RequiredAuthRoute;

  const requirements = REQUIREMENTS.filter(requirement => declared[requirement] !== undefined);
  if (requirements.length > 0) {
    const reason = `${describeRoute(route)} is declared '${access}' but also requires ${requirements.join(', ')}; move the requirement onto the methods that need it`;
    throw AuthErrorCode.CONFIG_INVALID.create({ reason });
  }

  if (access === 'optional' && mode === 'private') return { access: 'required' };
  return { access };
}

/** The application's resolved access mode, for app code that has to agree with the guard — a cache policy, a sentinel, a context resolver */
export class AuthAccessPolicy {
  constructor(readonly mode: AuthAccessMode) {}

  isPrivate(): boolean {
    return this.mode === 'private';
  }

  resolve(route: HandlerMetadata): AuthRouteMetadata {
    return resolveRoutePolicy(route, this.mode);
  }
}
