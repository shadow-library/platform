import { type QueryClient } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { sessionQuery, type SessionResponse } from '@/lib/apis';

/**
 * The SSR-safe auth gate for every route group — Novel Forge is a private authoring workshop, nothing is
 * public. Built on `@shadow-library/web`'s `requireAuth`, it ensures the session query server-side before
 * any protected markup renders, so an unauthenticated visitor is redirected (302 on the initial request,
 * client navigation thereafter) with no flash of protected content. `/login` is a local shim that hands
 * the browser to the backend's `/api/auth/login?returnTo=` OIDC redirect with a full-page load.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQuery, { loginTo: '/login', returnTo });
}

/**
 * `requireSession` only runs when the browser first enters a protected route group: TanStack reuses the
 * layout match, so its `beforeLoad` never re-runs while navigating between pages inside the shell. This
 * binds `@shadow-library/web/router`'s shared `useSessionGuard` (hoisted out of pulse-web, which had grown
 * this same gap-closer independently) to novel-forge's own session query and `/login` route, keeping the
 * session live for as long as the authenticated shell is mounted — re-validating on every in-app
 * navigation and whenever the tab regains focus, and bouncing to `/login` the moment the server reports
 * the session is gone.
 */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: sessionQuery, loginTo: '/login' });
}
