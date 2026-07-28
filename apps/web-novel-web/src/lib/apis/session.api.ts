/**
 * Importing npm packages
 */
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { type ApiResult, call } from '@shadow-library/web';
import { requireAuth } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { queryPersister } from '@/lib/offline';

import { FIXTURE_SESSION } from './fixtures';
import { clearLibraryMirror } from './library.api';
import { clearProgressMirror } from './progress.api';
import { ApiError, useFixtures } from './transport';
import { type SessionUser } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * webnovel-server's session surface (verified live): `GET /api/auth/session` answers 200 with the
 * flat reader `{ userId, email?, name? }` — or a plain 401 when signed out — alongside
 * `GET /api/auth/login?returnTo=` (full-page redirect into the identity IdP) and `POST /api/auth/logout`.
 * The signed-out 401 is folded into a `null` session here: a guest browsing the public catalog is a
 * valid state for the reader, not a failure.
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
  const result = await serverFetch<SessionUser>({ method: 'GET', path: '/auth/session' });
  if (!result.ok && result.failure.status === 401) return { ok: true, data: null };
  return result;
});

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

export function loginUrl(returnTo: string): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function logoutUrl(): string {
  return '/api/auth/logout';
}

/**
 * Wipe every on-device trace of the session before the logout redirect: the in-memory query cache, the
 * IndexedDB query persister, and this user's namespaced library/progress mirrors. Without this, the next
 * person on the device would inherit the previous account's cached shelf and reading history.
 */
export async function purgeOnLogout(queryClient: QueryClient, userId?: string): Promise<void> {
  clearLibraryMirror(userId);
  clearProgressMirror(userId);
  queryClient.clear();
  await queryPersister.removeClient();
}
