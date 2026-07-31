/**
 * Importing npm packages
 */
import { type EnsureQueryDataOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { isApiError } from '../lib/api-error';

/**
 * Defining types
 */
export interface RequireAuthOptions {
  /** Where to send an unauthenticated visitor, e.g. `/login`. */
  loginTo: string;
  /** The destination to preserve as a `returnTo` search param. */
  returnTo: string;
}

/**
 * Declaring the constants
 */

/**
 * The SSR-safe auth gate for protected route groups. Run from `beforeLoad`, it ensures `query` server-side
 * before any protected markup renders — so an unauthenticated visitor is redirected (302 on the initial
 * request, client navigation thereafter) with no flash of protected content, and the ensured data seeds the
 * cache the screens read. A non-401 failure propagates to the error boundary.
 *
 * The generics mirror `queryClient.ensureQueryData`, so a `queryOptions<T>()` value flows straight through and
 * the resolved data type is inferred — no `as Parameters<typeof requireAuth>[1]` cast at the call site.
 */
export async function requireAuth<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  queryClient: QueryClient,
  query: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>,
  options: RequireAuthOptions,
): Promise<TData> {
  try {
    return await queryClient.ensureQueryData(query);
  } catch (error) {
    if (isApiError(error) && error.status === 401) throw redirect({ to: options.loginTo, search: { returnTo: options.returnTo } });
    throw error;
  }
}
