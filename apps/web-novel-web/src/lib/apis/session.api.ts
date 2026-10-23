import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { type AuthAccessMode, type AuthPrincipal, createAuthApi } from '@shadow-library/web/auth';
import { purgeOfflineData } from '@shadow-library/web/offline';
import { requireAccess, requireAuth, resolveAccessMode, type SessionGuardStatus, useSessionGuard } from '@shadow-library/web/router';

import { OFFLINE_DB_NAME, offlineStore, PURGE_CACHE_PREFIXES, queryPersister } from '@/lib/offline';

import { clearLibraryMirror } from './library.api';
import { clearNotificationsMirror } from './notifications.api';
import { clearProgressMirror } from './progress.api';
import { apiClient, ApiError, isApiError } from './transport';
import { type SessionUser } from './types';

/**
 * `/api/auth/*` is `@shadow-library/auth`'s surface; `createAuthApi` supplies the principal shape and login/logout routes.
 * The session read is isomorphic: SSR forwards the caller's cookie so gates redirect with a real 302. The signed-out 401 becomes a `null` session,
 * since a guest browsing a public deployment is valid; a private deployment never lets one past {@link requireReaderAccess}.
 */
const authApi = createAuthApi(apiClient.auth);

export const sessionKeys = {
  session: ['auth', 'session'] as const,
  required: ['auth', 'session', 'required'] as const,
};

/** The reader's `sub` is the identity subject; it maps onto the device-namespacing `userId` the UI keys everything off. */
async function fetchSession(): Promise<SessionUser | null> {
  const result = await apiClient.auth.get('/session').result<AuthPrincipal>();
  if (result.ok) return { userId: result.data.sub };
  if (result.failure.status === 401) return null;
  throw new ApiError(result.failure.status, result.failure, result.failure.retryAfterSeconds);
}

/** Kept off {@link sessionQueryOptions}: that query gates the library route and a missing name is not a reason to fail a gate. */
async function fetchUserInfo(): Promise<UserInfo> {
  return apiClient.auth.get('/userinfo').execute<UserInfo>();
}

export const meQuery = userInfoQueryOptions(fetchUserInfo);

export const sessionQueryOptions = () =>
  queryOptions<SessionUser | null, ApiError>({
    queryKey: sessionKeys.session,
    // A hydrated session must not refetch the instant a screen mounts. 30s matches the router's query default so
    // post-hydration navigations reuse the cached principal. The signed-out 401 is folded into a `null` value
    // rather than thrown, so a retry buys nothing — keep it off.
    staleTime: 30_000,
    retry: false,
    queryFn: fetchSession,
  });

const requiredSessionQueryOptions = () =>
  queryOptions<SessionUser, ApiError>({
    queryKey: sessionKeys.required,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const session = await fetchSession();
      if (!session) throw new ApiError(401, { code: 'UNAUTHENTICATED', type: 'UnauthorizedError', message: 'Sign in to continue' });
      return session;
    },
  });

export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionUser> {
  // `requireAuth`'s generic param is invariant over the branded `staleTime` in `queryOptions<T>()`, so the
  // options are widened to the parameter's own type and the (runtime-correct) result narrowed back.
  const query = requiredSessionQueryOptions() as Parameters<typeof requireAuth>[1];
  return requireAuth(queryClient, query, { loginTo: '/login', returnTo }) as Promise<SessionUser>;
}

/** The deployment's access mode, failing closed to `private` and never rejecting — for routes outside the gate. */
export function readAccessMode(queryClient: QueryClient): Promise<AuthAccessMode> {
  return resolveAccessMode(queryClient, authApi.accessQueryOptions());
}

export async function requireReaderAccess(queryClient: QueryClient, returnTo: string): Promise<AuthAccessMode> {
  const session = requiredSessionQueryOptions() as Parameters<typeof requireAuth>[1];
  const gate = await requireAccess(queryClient, { access: authApi.accessQueryOptions(), session, loginTo: '/login', returnTo });
  if (gate.mode === 'public') return gate.mode;
  // Seeds the nullable read the chrome renders from, so a signed-in reader's SSR document never shows "Sign in".
  if (queryClient.getQueryData(sessionKeys.session) == null) queryClient.setQueryData(sessionKeys.session, gate.session as SessionUser);
  return gate.mode;
}

/** Keeps a private deployment's session live after the gate, bouncing to `/login` when it ends; disarmed on a public deployment. */
export function useReaderSessionGuard(accessMode: AuthAccessMode): SessionGuardStatus {
  return useSessionGuard({ query: requiredSessionQueryOptions(), loginTo: '/login', enabled: accessMode === 'private' });
}

/** The SDK's login route reads the RFC-spelled `return_to`; the web's own `/login` route keeps `returnTo`. */
export function loginUrl(returnTo: string): string {
  return authApi.loginUrl(returnTo);
}

/**
 * A `POST` behind webnovel-server's CSRF double-submit. An already-invalid session still signs out locally, so `ApiError` is swallowed.
 * Returns identity's end-session URL when RP-initiated logout is configured; the caller must navigate there or the reader stays signed in at identity.
 */
export async function signOut(): Promise<string | undefined> {
  try {
    return (await authApi.logout()).redirectTo;
  } catch (error) {
    if (!isApiError(error)) throw error;
    return undefined;
  }
}

/**
 * Wipes every on-device trace of the session: query cache, persisted cache, user-namespaced mirrors, the downloads database and the cache-first chapter
 * responses (which may hold gated chapters).
 */
export async function purgeOnLogout(queryClient: QueryClient, userId?: string): Promise<void> {
  clearLibraryMirror(userId);
  clearProgressMirror(userId);
  clearNotificationsMirror(userId);
  queryClient.clear();
  offlineStore.close();
  await queryPersister.removeClient();
  await purgeOfflineData({ databases: [OFFLINE_DB_NAME], cachePrefixes: [...PURGE_CACHE_PREFIXES] });
}
