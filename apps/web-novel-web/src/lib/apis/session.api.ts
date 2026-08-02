/**
 * Importing npm packages
 */
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { type ApiResult, call, type UserInfo, userInfoQueryOptions } from '@shadow-library/web';
import { requireAuth } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { queryPersister } from '@/lib/offline';

import { FIXTURE_SESSION } from './fixtures';
import { clearLibraryMirror } from './library.api';
import { clearProgressMirror } from './progress.api';
import { ApiError, APIRequest, isApiError, useFixtures } from './transport';
import { type SessionUser } from './types';

/**
 * Defining types
 */

/** The `@shadow-library/auth` principal returned by `GET /api/auth/session`: the identity subject plus token metadata */
interface SessionPrincipal {
  sub: string;
  scopes: string[];
  org?: string;
  aal?: string;
  clientId?: string;
}

/**
 * Declaring the constants
 *
 * The reader login surface is now owned by webnovel-server's `@shadow-library/auth` module, mounted at
 * `/api/auth`: `GET /api/auth/session` answers 200 with the flat principal `{ sub, scopes, ... }` — or a
 * plain 401 when signed out — alongside `GET /api/auth/login?return_to=` (full-page redirect into the
 * identity IdP) and `POST /api/auth/logout`. The `sub` is the reader's identity subject; it maps onto the
 * device-namespacing `userId` the UI keys everything off. The signed-out 401 is folded into a `null`
 * session: a guest browsing the public catalog is a valid state for the reader, not a failure.
 *
 * The session read goes through a TanStack Start server function (`serverFetch`) so the browser's session
 * cookie is forwarded during SSR — that is what lets `requireSession` gate the library route server-side
 * with a real 302 instead of a client-side flash.
 */
export const sessionKeys = {
  session: ['auth', 'session'] as const,
};

const fetchSession = createServerFn({ method: 'GET' }).handler(async (): Promise<ApiResult<SessionUser | null>> => {
  if (useFixtures) return { ok: true, data: FIXTURE_SESSION };
  const { serverFetch } = await import('./server-fetch');
  const result = await serverFetch<SessionPrincipal>({ method: 'GET', path: '/auth/session' });
  if (!result.ok) return result.failure.status === 401 ? { ok: true, data: null } : result;
  return { ok: true, data: { userId: result.data.sub } };
});

/**
 * The reader's own profile, from the SDK's userinfo route. Kept off {@link sessionQueryOptions} on
 * purpose: that query gates the library route, and a name is not a reason to fail a gate. `name` and
 * `email` used to exist on `SessionUser` but were only ever populated under fixtures — this is where
 * they actually come from.
 */
const fetchUserInfo = createServerFn({ method: 'GET' }).handler(async (): Promise<ApiResult<UserInfo>> => {
  if (useFixtures) return { ok: true, data: { sub: FIXTURE_SESSION.userId, name: FIXTURE_SESSION.name, email: FIXTURE_SESSION.email } };
  const { serverFetch } = await import('./server-fetch');
  return serverFetch<UserInfo>({ method: 'GET', path: '/auth/userinfo' });
});

export const meQuery = userInfoQueryOptions(() => call(fetchUserInfo()));

export const sessionQueryOptions = () =>
  queryOptions<SessionUser | null, ApiError>({
    queryKey: sessionKeys.session,
    staleTime: 5 * 60_000,
    queryFn: () => call(fetchSession()),
  });

const requiredSessionQueryOptions = () =>
  queryOptions<SessionUser, ApiError>({
    queryKey: [...sessionKeys.session, 'required'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const session = await call(fetchSession());
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
  return `/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * Ends the server-side app session. The SDK's logout is a `POST` behind webnovel-server's CSRF
 * double-submit, so it goes through the shared `APIRequest` — whose pre-request hook attaches the
 * `x-csrf-token` header — rather than a navigation. An already-invalid session still signs the reader
 * out locally, so an expected `ApiError` is swallowed; anything else propagates. No-ops under fixtures.
 */
export async function signOut(): Promise<void> {
  if (useFixtures) return;
  try {
    await APIRequest.post('/api/auth/logout').execute();
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
