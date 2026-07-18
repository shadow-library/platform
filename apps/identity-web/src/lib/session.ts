/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { requireAuth } from '@shadow-library/web/router';

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
  // `requireAuth` (web 0.2) mirrors `ensureQueryData`'s generics, so `meQueryOptions()` flows through
  // and `MeResponse` is inferred — no widening cast needed anymore.
  return requireAuth(queryClient, meQueryOptions(), { loginTo: '/login', returnTo });
}
