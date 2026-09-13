import { type QueryClient } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { sessionQueryOptions, type SessionResponse } from '@/lib/apis';

/**
 * The auth gate for every route group — nothing in Shadow Memoir is public. An unauthenticated visitor (401) is
 * redirected to the `/login` shim with the intended destination preserved; a non-401 failure propagates to the
 * route error boundary.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQueryOptions(), { loginTo: '/login', returnTo });
}

/**
 * `requireSession` runs only when the browser first enters the `_app` group — TanStack reuses the layout
 * match, so its `beforeLoad` never re-runs while navigating inside the shell. This keeps the session live
 * for as long as the shell is mounted and bounces the moment the server reports it is gone.
 */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: sessionQueryOptions(), loginTo: '/login' });
}
