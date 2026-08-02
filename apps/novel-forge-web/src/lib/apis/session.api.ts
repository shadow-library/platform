/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { call, type UserInfo, userInfoQueryOptions } from '@shadow-library/web';

/**
 * Importing user defined packages
 */
import { type ApiError } from './api-request';
import { serverAuthFetch } from './server-fetch';

/**
 * Defining types
 */

/**
 * The principal shape the `@shadow-library/auth` SDK's session surface answers with:
 * `GET /api/auth/session` returns 200 with this for an established session and 401 otherwise — never a
 * 200 null. `sub` is the stable user id; the SDK no longer returns `email`/`name` (the cookie carries an
 * opaque handle, not a token, so the browser is told only what the guard exposes).
 */
export interface SessionResponse {
  sub: string;
  scopes: string[];
  org?: string;
  aal?: string;
  clientId?: string;
}

/** `POST /api/auth/logout` ends the app session and clears the cookie; identity's own session is untouched. */
export interface LogoutResponse {
  success: boolean;
}

/**
 * Declaring the constants
 */
const sessionKeys = {
  current: ['auth', 'session'] as const,
};

const fetchSession = createServerFn({ method: 'GET' }).handler(() => serverAuthFetch<SessionResponse>({ method: 'GET', path: '/session' }));

const fetchUserInfo = createServerFn({ method: 'GET' }).handler(() => serverAuthFetch<UserInfo>({ method: 'GET', path: '/userinfo' }));

const requestLogout = createServerFn({ method: 'POST' }).handler(() => serverAuthFetch<LogoutResponse>({ method: 'POST', path: '/logout' }));

/**
 * Route-critical: the signed-in identity. A 401 here means "no session" — the route gates read that to
 * bounce to the backend's login redirect — so this query never retries (a retry would just re-confirm the
 * 401). `beforeLoad` gates ensure it; components read the warm cache.
 */
export const sessionQuery = queryOptions<SessionResponse, ApiError>({
  queryKey: sessionKeys.current,
  queryFn: () => call(fetchSession()),
  retry: false,
  staleTime: 60_000,
});

export function useSessionQuery(): UseQueryResult<SessionResponse, ApiError> {
  return useQuery(sessionQuery);
}

/**
 * The signed-in author, by name. The route is the SDK's, the key and caching policy are
 * `@shadow-library/web`'s, and the only thing this app supplies is the transport — which has to live
 * here because `/api/auth/*` travels through a TanStack Start server function.
 */
export const meQuery = userInfoQueryOptions(() => call(fetchUserInfo()));

export function useMeQuery(): UseQueryResult<UserInfo, ApiError> {
  return useQuery(meQuery);
}

/** Ends the first-party app session. The caller navigates to `/login` on success — the SDK ends only this app's session, so identity may re-establish it. */
export function useLogoutMutation(): UseMutationResult<LogoutResponse, ApiError, undefined> {
  return useMutation<LogoutResponse, ApiError, undefined>({ mutationFn: () => call(requestLogout()) });
}
