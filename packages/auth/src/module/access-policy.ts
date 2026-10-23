import { type HandlerMetadata } from '@shadow-library/app';

import { AuthErrorCode } from '../errors';
import { type AuthAccessMode } from '../interfaces';
import { AUTH_ROUTE_METADATA } from './constants';
import { type AuthRouteAccess, type AuthRouteMetadata, type RequiredAuthRoute } from './decorators';

type DeclaredAuthRoute = Partial<Omit<RequiredAuthRoute, 'access'>> & { access?: unknown };

// Access is merged from class and method before it is read, so a method-level `@Public()` under a class-level `@RequireScope()` arrives as `public` still carrying
// scopes; which was meant cannot be told, so the route is refused at registration.
const ROUTE_ACCESS: readonly AuthRouteAccess[] = ['public', 'optional', 'required'];
const REQUIREMENTS: readonly (keyof DeclaredAuthRoute)[] = ['scopes', 'permission', 'failOpen', 'highRisk', 'elevated', 'botPermissions'];

const describeRoute = (route: HandlerMetadata): string => `${String(route.method ?? '*')} ${String(route.path ?? '/')}`;

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

export class AuthAccessPolicy {
  constructor(readonly mode: AuthAccessMode) {}

  isPrivate(): boolean {
    return this.mode === 'private';
  }

  resolve(route: HandlerMetadata): AuthRouteMetadata {
    return resolveRoutePolicy(route, this.mode);
  }
}
