import { type QueryKey, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { isApiError } from '../lib/api-error';

export type SessionGuardStatus = 'authenticated' | 'redirecting';

export interface UseSessionGuardOptions<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> {
  /** The session query to keep live — pass the same `queryOptions<T>()` value the route gate ensures on entry. */
  query: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
  /** Where to bounce once the session is gone; the guard preserves the page it died on as a `returnTo` search param. @default '/login' */
  loginTo?: string;
  /** Reads a query error as an expired session. @default a 401 `ApiError` */
  isExpired?: (error: TError | null) => boolean;
  /**
   * Turns the guard off without unmounting it, for a shell whose access mode is only known at runtime (hooks
   * cannot be called conditionally). While disabled it neither fetches the session nor redirects. Overrides `query.enabled`.
   * @default true
   */
  enabled?: boolean;
}

function isSessionExpired(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

/**
 * TanStack reuses the layout match, so the route gate's `beforeLoad` does not re-run on in-app navigation; this re-validates the session on every
 * navigation and tab focus and bounces to `loginTo` with the current URL as `returnTo`. The status lets the shell withhold its chrome while redirecting.
 */
export function useSessionGuard<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  options: UseSessionGuardOptions<TQueryFnData, TError, TData, TQueryKey>,
): SessionGuardStatus {
  const { query, loginTo = '/login', isExpired = isSessionExpired, enabled = true } = options;
  const navigate = useNavigate();
  const location = useLocation();
  // `refetchOnMount` is off because the gate already fetched on entry.
  const { error, refetch } = useQuery({ ...query, enabled, refetchOnMount: false, refetchOnWindowFocus: 'always' });

  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (enabled) void refetch();
  }, [location.pathname, refetch, enabled]);

  const isUnauthenticated = enabled && isExpired(error);
  // Once only: navigating to `loginTo` changes `location` and would re-run this effect, nesting `loginTo` into its own `returnTo`.
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!isUnauthenticated || hasRedirected.current) return;
    hasRedirected.current = true;
    void navigate({ to: loginTo, search: { returnTo: location.href } });
  }, [isUnauthenticated, navigate, loginTo, location.href]);

  return isUnauthenticated ? 'redirecting' : 'authenticated';
}
