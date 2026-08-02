/**
 * Importing npm packages
 */
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { type AuthPrincipal, createAuthApi } from '@shadow-library/web/auth';
import { requireAuth } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { queryPersister } from '@/lib/offline';

import { FIXTURE_SESSION } from './fixtures';
import { clearLibraryMirror } from './library.api';
import { clearProgressMirror } from './progress.api';
import { apiClient, ApiError, isApiError, useFixtures } from './transport';
import { type SessionUser } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `/api/auth/*` is `@shadow-library/auth`'s surface, not the reader's: webnovel-server mounts the SDK, so
 * `GET /api/auth/session`, `GET /api/auth/login?return_to=` and `POST /api/auth/logout` are the SDK's
 * contract. `createAuthApi` is the client half of it, so the principal shape and the login/logout routes come
 * from there instead of being restated here.
 *
 * The session read is isomorphic now: in the browser it is a same-origin call, and during SSR the shared
 * transport forwards the caller's cookie — which is what still lets `requireSession` gate the library route
 * server-side with a real 302 rather than a client-side flash. The signed-out 401 is folded into a `null`
 * session: a guest browsing the public catalog is a valid state for the reader, not a failure.
 */
const authApi = createAuthApi(apiClient.auth);

export const sessionKeys = {
  session: ['auth', 'session'] as const,
};

/** The reader's `sub` is the identity subject; it maps onto the device-namespacing `userId` the UI keys everything off. */
async function fetchSession(): Promise<SessionUser | null> {
  if (useFixtures) return FIXTURE_SESSION;

  const result = await apiClient.auth.get('/session').result<AuthPrincipal>();
  if (result.ok) return { userId: result.data.sub };
  if (result.failure.status === 401) return null;
  throw new ApiError(result.failure.status, result.failure, result.failure.retryAfterSeconds);
}

/**
 * The reader's own profile, from the SDK's userinfo route. Kept off {@link sessionQueryOptions} on
 * purpose: that query gates the library route, and a name is not a reason to fail a gate. `name` and
 * `email` used to exist on `SessionUser` but were only ever populated under fixtures — this is where
 * they actually come from.
 */
async function fetchUserInfo(): Promise<UserInfo> {
  if (useFixtures) return { sub: FIXTURE_SESSION.userId, name: FIXTURE_SESSION.name, email: FIXTURE_SESSION.email };
  return apiClient.auth.get('/userinfo').execute<UserInfo>();
}

export const meQuery = userInfoQueryOptions(fetchUserInfo);

export const sessionQueryOptions = () =>
  queryOptions<SessionUser | null, ApiError>({
    queryKey: sessionKeys.session,
    staleTime: 5 * 60_000,
    queryFn: fetchSession,
  });

const requiredSessionQueryOptions = () =>
  queryOptions<SessionUser, ApiError>({
    queryKey: [...sessionKeys.session, 'required'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const session = await fetchSession();
      if (!session) throw new ApiError(401, { code: 'UNAUTHENTICATED', type: 'UnauthorizedError', message: 'Sign in to continue' });
      return session;
    },
  });

/** The SSR-safe auth gate for authed routes — redirects guests to `/login?returnTo=…` via `requireAuth`. */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionUser> {
  // `requireAuth`'s generic param is invariant over the branded `staleTime` in `queryOptions<T>()`, so the
  // options are widened to the parameter's own type and the (runtime-correct) result narrowed back.
  const query = requiredSessionQueryOptions() as Parameters<typeof requireAuth>[1];
  return requireAuth(queryClient, query, { loginTo: '/login', returnTo }) as Promise<SessionUser>;
}

/** The SDK's login route reads the RFC-spelled `return_to`; the web's own `/login` route keeps `returnTo`. */
export function loginUrl(returnTo: string): string {
  return authApi.loginUrl(returnTo);
}

/**
 * Ends the server-side app session. The SDK's logout is a `POST` behind webnovel-server's CSRF
 * double-submit, which the shared transport satisfies on the browser path. An already-invalid session still
 * signs the reader out locally, so an expected `ApiError` is swallowed; anything else propagates. No-ops
 * under fixtures.
 */
export async function signOut(): Promise<void> {
  if (useFixtures) return;
  try {
    await authApi.logout();
  } catch (error) {
    if (!isApiError(error)) throw error;
  }
}

/**
 * Wipe every on-device trace of the session on sign-out: the in-memory query cache, the IndexedDB query
 * persister, and this user's namespaced library/progress mirrors. Without this, the next person on the
 * device would inherit the previous account's cached shelf and reading history.
 */
export async function purgeOnLogout(queryClient: QueryClient, userId?: string): Promise<void> {
  clearLibraryMirror(userId);
  clearProgressMirror(userId);
  queryClient.clear();
  await queryPersister.removeClient();
}
