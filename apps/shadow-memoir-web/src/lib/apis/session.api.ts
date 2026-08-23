import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { createAuthApi } from '@shadow-library/web/auth';

import { apiClient } from './transport';

/**
 * `/api/auth/*` is `@shadow-library/auth`'s surface, not Shadow Memoir's: the SDK owns `session`, `logout`
 * and `login` on every service that mounts it. `createAuthApi` is the client half of that contract, so this
 * module binds it to the app's auth surface instead of restating endpoints a backend change could invalidate.
 */
export type { AuthPrincipal as SessionResponse } from '@shadow-library/web/auth';

const authApi = createAuthApi(apiClient.auth);

export const sessionKeys = authApi.keys;

/**
 * Two session reads, deliberately. `sessionQueryOptions` throws on 401 — that is what the route gate reads
 * to bounce an unauthenticated visitor. `optionalSessionQueryOptions` folds the 401 into `null`, which is
 * what the landing screen and the shell need: signed out is a state Shadow Memoir renders, not a failure.
 */
export const { loginUrl, logout, optionalSessionQueryOptions, sessionQueryOptions } = authApi;

/**
 * The owner's own profile, from the SDK's userinfo route. Deliberately separate from the session query:
 * that one gates every route, and a missing display name is not a reason to fail a gate.
 */
async function fetchUserInfo(): Promise<UserInfo> {
  return apiClient.auth.get('/userinfo').execute<UserInfo>();
}

export const meQuery = userInfoQueryOptions(fetchUserInfo);
