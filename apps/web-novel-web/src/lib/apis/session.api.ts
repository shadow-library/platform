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
import { FIXTURE_SESSION } from './fixtures';
import { ApiError, useFixtures } from './transport';
import { type SessionResponse, type SessionUser } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * ASSUMPTION (flagged): `@shadow-library/auth`'s `RelyingPartyModule` ships only the OIDC protocol core —
 * session-cookie routes are left to the consuming app — so webnovel-server is assumed to expose
 * `GET /api/auth/session` (200 `{ authenticated, user }`, or 401 when signed out),
 * `GET /api/auth/login?returnTo=` (full-page redirect into the identity IdP), and `POST /api/auth/logout`.
 * Adjust here if webnovel-server lands a different surface.
 *
 * The session read goes through a TanStack Start server function (`serverFetch`) so the browser's session
 * cookie is forwarded during SSR — that is what lets `requireSession` gate the library route server-side
 * with a real 302 instead of a client-side flash.
 */
export const sessionKeys = {
  session: ['auth', 'session'] as const,
};

const fetchSession = createServerFn({ method: 'GET' }).handler(async (): Promise<ApiResult<SessionResponse>> => {
  if (useFixtures) return { ok: true, data: FIXTURE_SESSION };
  const { serverFetch } = await import('./server-fetch');
  const result = await serverFetch<SessionResponse>({ method: 'GET', path: '/auth/session' });
  // Signed-out is a valid state for a public reader, not a failure.
  if (!result.ok && result.failure.status === 401) return { ok: true, data: { authenticated: false } };
  return result;
});

export const sessionQueryOptions = () =>
  queryOptions<SessionResponse, ApiError>({
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
      if (!session.authenticated || !session.user) throw new ApiError(401, { code: 'UNAUTHENTICATED', type: 'UnauthorizedError', message: 'Sign in to continue' });
      return session.user;
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
