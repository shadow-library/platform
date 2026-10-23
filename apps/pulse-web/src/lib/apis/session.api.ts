import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { createAuthApi } from '@shadow-library/web/auth';

import { apiClient } from './transport';

export type { AuthPrincipal as SessionResponse } from '@shadow-library/web/auth';

// Keeps createAuthApi's default staleTime of 0: the route gate and the in-shell guard must revalidate against the server, not a cached snapshot.
const authApi = createAuthApi(apiClient.auth);

export const { organisationsQueryOptions, sessionQueryOptions, switchOrganisation } = authApi;

/** The central identity session stays live unless the deployment configures RP-initiated logout, in which case the reply carries `redirectTo`. */
export const logout = authApi.logout;

// Separate from the session query so a missing display name never fails the route gate; the session principal carries only `sub`.
async function fetchUserInfo(): Promise<UserInfo> {
  return apiClient.auth.get('/userinfo').execute<UserInfo>();
}

export const meQuery = userInfoQueryOptions(fetchUserInfo);
