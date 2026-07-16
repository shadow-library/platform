/**
 * Importing npm packages
 */
import { requireAuth } from '@shadow-library/web/router';
import { type QueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type MeResponse, meQueryOptions } from '@/lib/apis';

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
  // `requireAuth` types its query param as the non-generic `EnsureQueryDataOptions<unknown, …>`, which a
  // strongly-typed `queryOptions<MeResponse>()` is not assignable to (its branded `staleTime` is invariant).
  // The value is correct at runtime; widen the compiler's view to the parameter's own type.
  return requireAuth<MeResponse>(queryClient, meQueryOptions() as Parameters<typeof requireAuth>[1], { loginTo: '/login', returnTo });
}
