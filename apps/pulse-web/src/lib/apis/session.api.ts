import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { createAuthApi } from '@shadow-library/web/auth';

import { apiClient } from './transport';

/**
 * `/api/auth/*` is `@shadow-library/auth`'s surface, not pulse's: the SDK owns `session`, `logout`,
 * `organisations` and `organisation` on every service that mounts it. `createAuthApi` is the client half of
 * that contract, so this module binds it to pulse's auth surface and re-exports it under the names the app
 * already uses, rather than restating endpoints and response shapes a backend change could invalidate.
 */
export type { AuthOrganisation as OrganisationResponse, AuthPrincipal as SessionResponse } from '@shadow-library/web/auth';

/**
 * The session mirrors live auth state, so `createAuthApi`'s default `staleTime: 0` is kept: the route gate
 * and the in-shell `useSessionGuard` both re-validate against the server rather than trusting a cached
 * snapshot, so the shell is shown only while the session is currently valid.
 */
const authApi = createAuthApi(apiClient.auth);

export const sessionKeys = authApi.keys;

/**
 * Pulse is INTERNAL, so `organisationsQueryOptions` is in practice the platform organisation alone — the
 * switcher exists for the day that stops being true and renders nothing until then.
 */
export const { organisationsQueryOptions, sessionQueryOptions, switchOrganisation } = authApi;

/**
 * Ends the app session on pulse-server (`POST /api/auth/logout`). The SDK revokes the session and clears
 * the `__Host-shadow-session` cookie; the central identity session is deliberately untouched unless the
 * deployment configures RP-initiated logout, in which case the reply carries `redirectTo`.
 */
export const logout = authApi.logout;

/**
 * The operator's own profile, from the SDK's userinfo route. Deliberately separate from the session
 * query: that one gates every route, and a missing display name is not a reason to fail a gate. The
 * session principal carries only `sub`, so the name and email the account menu shows come from here.
 */
async function fetchUserInfo(): Promise<UserInfo> {
  return apiClient.auth.get('/userinfo').execute<UserInfo>();
}

export const meQuery = userInfoQueryOptions(fetchUserInfo);
