/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { requireAuth } from '@shadow-library/web/router';

/**
 * Importing user defined packages
 */
import { sessionQuery, type SessionResponse } from '@/lib/apis';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The SSR-safe auth gate for every route group — Novel Forge is a private authoring workshop, nothing is
 * public. Built on `@shadow-library/web`'s `requireAuth`, it ensures the session query server-side before
 * any protected markup renders, so an unauthenticated visitor is redirected (302 on the initial request,
 * client navigation thereafter) with no flash of protected content. `/login` is a local shim that hands
 * the browser to the backend's `/api/auth/login?returnTo=` OIDC redirect with a full-page load.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQuery, { loginTo: '/login', returnTo });
}
