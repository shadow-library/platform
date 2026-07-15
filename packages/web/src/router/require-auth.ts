/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { ApiError } from '../lib/api-error';

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
 */
export async function requireAuth<T = unknown>(queryClient: QueryClient, query: Parameters<QueryClient['ensureQueryData']>[0], options: RequireAuthOptions): Promise<T> {
  try {
    return (await queryClient.ensureQueryData(query)) as T;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect({ to: options.loginTo, search: { returnTo: options.returnTo } });
    throw error;
  }
}
