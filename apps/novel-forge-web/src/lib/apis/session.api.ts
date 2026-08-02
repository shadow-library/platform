/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { type AuthLogoutResult, type AuthPrincipal, createAuthApi } from '@shadow-library/web/auth';

/**
 * Importing user defined packages
 */
import { apiClient, type ApiError } from './transport';

/**
 * Defining types
 *
 * `/api/auth/*` is `@shadow-library/auth`'s surface, not Novel Forge's: the SDK owns `session`, `logout`,
 * `organisations` and `organisation` on every service that mounts it. `createAuthApi` is the client half of
 * that contract, so this module binds it to the app's auth surface and re-exports it under the names the
 * app already uses, rather than restating endpoints and response shapes a backend change could invalidate.
 *
 * `SessionResponse` is the SDK's principal: `sub` is the stable user id, and the cookie carries an opaque
 * handle rather than a token, so the browser is told only what the guard exposes.
 */
export type { AuthLogoutResult as LogoutResponse, AuthPrincipal as SessionResponse } from '@shadow-library/web/auth';

/**
 * Declaring the constants
 */
const authApi = createAuthApi(apiClient.auth, { staleTime: 60_000 });

/**
 * Route-critical: the signed-in identity. A 401 here means "no session" — the route gates read that to
 * bounce to the backend's login redirect — so this query never retries (a retry would just re-confirm the
 * 401). `beforeLoad` gates ensure it; components read the warm cache.
 */
export const sessionQuery = authApi.sessionQueryOptions();

export function useSessionQuery(): UseQueryResult<AuthPrincipal, ApiError> {
  return useQuery(sessionQuery);
}

/**
 * The signed-in author, by name. The route is the SDK's and the key and caching policy are
 * `@shadow-library/web`'s; this app supplies only the transport. That transport is a plain surface call
 * now the client is isomorphic — the server function it used to need is gone.
 */
export const meQuery = userInfoQueryOptions(() => apiClient.auth.get('/userinfo').execute<UserInfo>());

export function useMeQuery(): UseQueryResult<UserInfo, ApiError> {
  return useQuery(meQuery);
}

/** Ends the first-party app session. The caller navigates to `/login` on success — the SDK ends only this app's session, so identity may re-establish it. */
export function useLogoutMutation(): UseMutationResult<AuthLogoutResult, ApiError, undefined> {
  return useMutation<AuthLogoutResult, ApiError, undefined>({ mutationFn: () => authApi.logout() });
}
