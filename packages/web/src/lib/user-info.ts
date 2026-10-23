import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type ApiError } from './api-error';

/** The signed-in person as `GET /api/auth/userinfo` answers (OIDC claims). Only `sub` is guaranteed; render {@link userDisplayName}. */
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

/** One key for every app, so a profile cached by a route loader is the one a component reads. */
export const userInfoQueryKey = ['auth', 'userinfo'] as const;

// Not `Infinity`: someone who renames themselves should see it without clearing anything.

const USER_INFO_STALE_TIME = 5 * 60_000;

/** An app supplies only the transport and inherits the key and caching. A failure is a missing name, never a reason to bounce to login. */
export function userInfoQueryOptions(fetchUserInfo: () => Promise<UserInfo>): UseQueryOptions<UserInfo, ApiError> {
  return queryOptions<UserInfo, ApiError>({
    queryKey: userInfoQueryKey,
    queryFn: fetchUserInfo,
    staleTime: USER_INFO_STALE_TIME,
  });
}

/** Deliberately never falls back to `sub`: a database key reads as the application having lost track of who the person is. */
export function userDisplayName(user?: Pick<UserInfo, 'name' | 'given_name' | 'family_name' | 'preferred_username'>, fallback = 'Account'): string {
  const fullName = [user?.given_name, user?.family_name].filter(Boolean).join(' ');
  return user?.name?.trim() || fullName.trim() || user?.preferred_username?.trim() || fallback;
}
