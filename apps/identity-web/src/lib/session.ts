import { type QueryClient } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { meQueryOptions, type MeResponse } from '@/lib/apis';

/**
 * Redirects to `/login` before any protected markup renders (302 on the initial request).
 * `MeResponse` carries no staff flag: the identity server enforces admin authorization on every privileged endpoint.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<MeResponse> {
  return requireAuth(queryClient, meQueryOptions(), { loginTo: '/login', returnTo });
}

/** `beforeLoad` never re-runs when navigating inside a shell, so this keeps revalidating (navigation, tab focus) and bounces to `/login` once the session is gone. */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: meQueryOptions(), loginTo: '/login' });
}
