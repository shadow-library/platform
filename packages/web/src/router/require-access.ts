/**
 * Importing npm packages
 */
import { type EnsureQueryDataOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type AuthAccess } from '../auth';
import { requireAuth, type RequireAuthOptions } from './require-auth';

/**
 * Defining types
 */
export interface RequireAccessOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TAccessError = unknown,
  TAccessKey extends QueryKey = QueryKey,
> extends RequireAuthOptions {
  /** The app's `accessQueryOptions()`. */
  access: EnsureQueryDataOptions<AuthAccess, TAccessError, AuthAccess, TAccessKey>;
  /** The session query a private deployment gates on — the same one `requireAuth` takes. */
  session: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>;
}

export type AccessGate<TSession> = { mode: 'public' } | { mode: 'private'; session: TSession };

/**
 * Declaring the constants
 */

/**
 * Fails closed: anything other than an exact `public` answer — a failed read (network, 5xx, endpoint missing) or an
 * unrecognised body — gates as `private`, because guessing `public` would expose a private deployment to guests.
 */
export async function requireAccess<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TAccessError = unknown,
  TAccessKey extends QueryKey = QueryKey,
>(queryClient: QueryClient, options: RequireAccessOptions<TQueryFnData, TError, TData, TQueryKey, TAccessError, TAccessKey>): Promise<AccessGate<TData>> {
  const { access, session, loginTo, returnTo } = options;
  const isPublic = await queryClient.ensureQueryData(access).then(
    result => result?.mode === 'public',
    () => false,
  );
  if (isPublic) return { mode: 'public' };
  return { mode: 'private', session: await requireAuth(queryClient, session, { loginTo, returnTo }) };
}
