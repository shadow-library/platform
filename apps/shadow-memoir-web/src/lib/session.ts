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

/**
 * Asks the server for the session's subject on a probe key, so a 401 stays out of the shared session query — that
 * query's error is what `useSessionGuard` redirects on, and an expired session must keep the owner working locally.
 * Only a successful answer naming a different account moves the shared query, which rebuilds the shell.
 */
export async function confirmSessionAccount(queryClient: QueryClient): Promise<string> {
  const shared = sessionQueryOptions();
  const session = await queryClient.fetchQuery({ ...shared, queryKey: [...shared.queryKey, 'probe'], gcTime: 0, staleTime: 0 });
  if (queryClient.getQueryData<SessionResponse>(shared.queryKey)?.sub !== session.sub) queryClient.setQueryData(shared.queryKey, session);
  return session.sub;
}
