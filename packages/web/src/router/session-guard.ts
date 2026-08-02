/**
 * Importing npm packages
 */
import { type QueryKey, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * Importing user defined packages
 */
import { isApiError } from '../lib/api-error';

/**
 * Defining types
 */
export type SessionGuardStatus = 'authenticated' | 'redirecting';

export interface UseSessionGuardOptions<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> {
  /** The session query to keep live — pass the same `queryOptions<T>()` value the route gate ensures on entry. */
  query: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
  /** Where to bounce once the session is gone; the guard preserves the page it died on as a `returnTo` search param. @default '/login' */
  loginTo?: string;
  /** Reads a query error as an expired session. @default a 401 `ApiError` */
  isExpired?: (error: TError | null) => boolean;
}

/**
 * Declaring the constants
 */

/** The default expiry test: the session read failed with the backend's 401. */
function isSessionExpired(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/**
 * Keep an app's session gate live for as long as its authenticated shell is mounted. The route-level gate
 * (`requireAuth`/`requireSession`) only runs when the browser first enters the protected group: TanStack
 * reuses the layout match, so its `beforeLoad` never re-runs while navigating between pages inside the shell.
 * This hook closes that gap — it re-validates the session against the server on every in-app navigation and
 * whenever the tab regains focus, and bounces to `loginTo` (preserving the current URL as `returnTo`) the
 * moment the server reports the session is gone. The returned status lets the shell withhold its chrome while
 * the redirect is in flight, so a session that ends mid-use never keeps rendering the app.
 *
 * It carries no app-specific import: the session query and the login route are its two parameters, so every
 * app binds its own and shares the behaviour.
 */
export function useSessionGuard<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseSessionGuardOptions<TQueryFnData, TError, TData, TQueryKey>,
): SessionGuardStatus {
  const { query, loginTo = '/login', isExpired = isSessionExpired } = options;
  const navigate = useNavigate();
  const location = useLocation();
  /** `refetchOnMount` is off because the gate already fetched on entry; navigation and focus drive every later check. */
  const { error, refetch } = useQuery({ ...query, refetchOnMount: false, refetchOnWindowFocus: 'always' });

  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    void refetch();
  }, [location.pathname, refetch]);

  const isUnauthenticated = isExpired(error);
  /**
   * Fire the bounce exactly once. The redirect moves through `loginTo`, which changes `location` and would
   * otherwise re-run this effect and nest `loginTo` into its own `returnTo`; the ref also pins `returnTo` to
   * the protected page the session died on, not the transient login URL.
   */
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!isUnauthenticated || hasRedirected.current) return;
    hasRedirected.current = true;
    void navigate({ to: loginTo, search: { returnTo: location.href } });
  }, [isUnauthenticated, navigate, loginTo, location.href]);

  return isUnauthenticated ? 'redirecting' : 'authenticated';
}
