/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { meQueryOptions, type MeResponse } from '@/lib/apis';

/**
 * Declaring the constants
 *
 * The SSR-safe auth gate for the authenticated route groups. Built on `@shadow-library/web`'s
 * `requireAuth`, it ensures the `me` query server-side before any protected markup renders — so an
 * unauthenticated visitor is redirected to `/login` (302 on the initial request, client navigation
 * thereafter) with no flash of protected content, and the ensured session seeds the cache the shells
 * read. A non-401 failure propagates to the error boundary.
 *
 * `console` reuses this: `MeResponse` carries no staff flag, so admin authorization stays where it must —
 * enforced by the identity server on every privileged endpoint (a non-admin who reaches the console gets
 * a 403 surfaced by the route error boundary, never silent access).
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<MeResponse> {
  /**
   * `requireAuth` (web 0.2) mirrors `ensureQueryData`'s generics, so `meQueryOptions()` flows through
   * and `MeResponse` is inferred — no widening cast needed anymore.
   */
  return requireAuth(queryClient, meQueryOptions(), { loginTo: '/login', returnTo });
}

/**
 * `requireSession` only runs when the browser first enters a protected route group: TanStack reuses the
 * layout match, so its `beforeLoad` never re-runs while navigating between pages inside the portal or console
 * shell. This binds `@shadow-library/web/router`'s shared `useSessionGuard` (the same gap-closer Novel Forge
 * and Pulse already use) to identity's `me` query and `/login` route, keeping the session live for as long as
 * an authenticated shell is mounted — re-validating on every in-app navigation and whenever the tab regains
 * focus, and bouncing to `/login` the moment the server reports the session is gone, so a session that ends
 * mid-use never keeps rendering the portal.
 */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: meQueryOptions(), loginTo: '/login' });
}
