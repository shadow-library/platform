import { type QueryClient, useQuery } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { accessQuery, sessionQuery, type SessionResponse } from '@/lib/apis';

/** The route gate for admin-only screens; a check that fails reads as "not an admin" rather than an error page. */
export function resolveIsAdmin(queryClient: QueryClient): Promise<boolean> {
  return queryClient.ensureQueryData(accessQuery).then(
    access => access.admin,
    () => false,
  );
}

/** Reads the access cache; `false` until it resolves, so callers never need a loading state. */
export function useIsAdmin(): boolean {
  const { data } = useQuery(accessQuery);
  return data?.admin === true;
}

/** Ensures the session before any protected markup renders, so an unauthenticated visitor is redirected (302 on the initial request) with no flash of protected content. */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQuery, { loginTo: '/login', returnTo });
}

/** `requireSession` never re-runs inside the shell, so this re-validates on every in-app navigation and tab focus and bounces to `/login` once the session is gone. */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: sessionQuery, loginTo: '/login' });
}
