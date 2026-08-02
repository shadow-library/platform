/**
 * Importing npm packages
 */
import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ApiError } from './api-error';

/**
 * Defining types
 */

/**
 * The signed-in person, as `GET /api/auth/userinfo` answers — the route `AuthModule.forRoot()` mounts
 * on every Shadow backend. Claim names are OIDC's, because the payload is identity's answer passed
 * through rather than a shape invented here.
 *
 * Everything but `sub` is optional and all of it can be absent at once: a profile nobody filled in is
 * a normal account, and a session established before the `profile` scope was requested carries no
 * name until its next login. Render {@link userDisplayName} rather than assuming a name is there.
 */
export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * Declaring the constants
 */

/** One key for every app, so a profile cached by a route loader is the one a component reads. */
export const userInfoQueryKey = ['auth', 'userinfo'] as const;

/**
 * A name changes about never, and the SDK caches behind this too, so the window is generous. It is
 * not `Infinity`: someone who renames themselves should see it without clearing anything.
 */
const USER_INFO_STALE_TIME = 5 * 60_000;

/**
 * The shared profile query. An app supplies only the transport — `/api/auth/*` travels through a
 * per-app server function, so the fetch cannot live here — and inherits the key, the caching policy
 * and the contract. That is what stops every app from growing its own profile endpoint and its own
 * subtly different response shape.
 *
 * Never route-critical: the server degrades to a subject-only profile when identity is unreachable,
 * so a failure here is a missing name, never a reason to bounce anyone to a login screen.
 */
export function userInfoQueryOptions(fetchUserInfo: () => Promise<UserInfo>): UseQueryOptions<UserInfo, ApiError> {
  return queryOptions<UserInfo, ApiError>({
    queryKey: userInfoQueryKey,
    queryFn: fetchUserInfo,
    staleTime: USER_INFO_STALE_TIME,
  });
}

/**
 * The best human label for a person, in the order a person would expect to be called.
 *
 * It deliberately never falls back to `sub`. That is a database key, and showing it reads to the
 * person as the application having lost track of who they are — which is exactly the bug this whole
 * surface exists to fix.
 */
export function userDisplayName(user?: Pick<UserInfo, 'name' | 'given_name' | 'family_name' | 'preferred_username'>, fallback = 'Account'): string {
  const fullName = [user?.given_name, user?.family_name].filter(Boolean).join(' ');
  return user?.name?.trim() || fullName.trim() || user?.preferred_username?.trim() || fallback;
}
