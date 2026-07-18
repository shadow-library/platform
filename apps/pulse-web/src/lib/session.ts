/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { requireAuth } from '@shadow-library/web/router';

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
