import { type EnsureQueryDataOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { isApiError } from '../lib/api-error';

export interface RequireAuthOptions {
  /** Where to send an unauthenticated visitor, e.g. `/login`. */
  loginTo: string;
  /** The destination to preserve as a `returnTo` search param. */
  returnTo: string;
}

/** Run from `beforeLoad`: ensures `query` server-side so an unauthenticated visitor is redirected with no flash of protected content. */
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
