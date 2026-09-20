import { type QueryClient, useQuery } from '@tanstack/react-query';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { sessionQuery, type SessionResponse } from '@/lib/apis';

/**
 * Mirrors the server's `ADMIN_PERMISSION` (`apps/novel-forge-server/src/constants.ts`) — redeclared rather
 * than imported for the same reason `AuthPrincipal` is: the backend dependency chain isn't something a web
 * app's type-check should drag in for one string.
 */
const ADMIN_SCOPE = 'novel-forge:admin';

/** Whether a session holds the scope that gates admin-only runs UI — the one place that string is checked. */
export function isAdminSession(session: Pick<SessionResponse, 'scopes'>): boolean {
  return session.scopes.includes(ADMIN_SCOPE);
}

/** Reads the already-warmed session cache; `false` until it resolves, so callers never need a loading state. */
export function useIsAdmin(): boolean {
  const { data } = useQuery(sessionQuery);
  return data != null && isAdminSession(data);
}

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
