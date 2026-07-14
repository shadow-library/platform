/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { ApiError, type MeResponse, meQueryOptions } from '@/lib/apis';

/**
 * Declaring the constants
 *
 * The SSR-safe auth gate for the authenticated route groups. Run from `beforeLoad`, it ensures the `me`
 * query server-side before any protected markup renders — so an unauthenticated visitor is redirected
 * (302 on the initial request, client navigation thereafter) with no flash of protected content, and the
 * ensured session seeds the cache the shells read. A non-401 failure propagates to the error boundary.
 *
 * `console` reuses this: `MeResponse` carries no staff flag, so admin authorization stays where it must —
 * enforced by the identity server on every privileged endpoint (a non-admin who reaches the console gets
 * a 403 surfaced by the route error boundary, never silent access).
 */
export async function requireSession(queryClient: QueryClient, returnTo: string): Promise<MeResponse> {
  try {
    return await queryClient.ensureQueryData(meQueryOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect({ to: '/login', search: { returnTo } });
    throw error;
  }
}
