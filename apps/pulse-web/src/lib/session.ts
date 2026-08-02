/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { sessionQueryOptions, type SessionResponse } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The auth gate for every admin route group. Built on `@shadow-library/web`'s `requireAuth`, it
 * ensures the session query before any protected markup renders — an unauthenticated visitor (401)
 * is redirected to `/login`, which bounces the browser to the server's OIDC login with the intended
 * destination preserved as `returnTo`. A non-401 failure propagates to the route error boundary.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQueryOptions(), { loginTo: '/login', returnTo });
}

/**
 * `requireSession` only runs when the browser first enters the `_app` group: TanStack reuses the layout
 * match, so its `beforeLoad` never re-runs while navigating between pages inside the shell. This binds
 * `@shadow-library/web/router`'s shared `useSessionGuard` (hoisted out of this very module) to pulse's own
 * session query and `/login` route, keeping the session live for as long as the authenticated shell is
 * mounted — re-validating on every in-app navigation and whenever the tab regains focus, and bouncing to
 * `/login` the moment the server reports the session is gone.
 */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: sessionQueryOptions(), loginTo: '/login' });
}
