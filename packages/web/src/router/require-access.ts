import { type EnsureQueryDataOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { type AuthAccess, type AuthAccessMode } from '../auth';
import { requireAuth, type RequireAuthOptions } from './require-auth';

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
  /** The session query a private deployment gates on. */
  session: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>;
}

export type AccessGate<TSession> = { mode: 'public' } | { mode: 'private'; session: TSession };

/** Fails closed: anything but an exact `public` answer reads as `private`, because guessing `public` would expose a private deployment to guests. Never rejects. */
export async function resolveAccessMode<TAccessError = unknown, TAccessKey extends QueryKey = QueryKey>(
  queryClient: QueryClient,
  access: EnsureQueryDataOptions<AuthAccess, TAccessError, AuthAccess, TAccessKey>,
): Promise<AuthAccessMode> {
  return queryClient.ensureQueryData(access).then(
    result => (result?.mode === 'public' ? 'public' : 'private'),
    () => 'private',
  );
}

export async function requireAccess<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TAccessError = unknown,
  TAccessKey extends QueryKey = QueryKey,
>(queryClient: QueryClient, options: RequireAccessOptions<TQueryFnData, TError, TData, TQueryKey, TAccessError, TAccessKey>): Promise<AccessGate<TData>> {
  const { access, session, loginTo, returnTo } = options;
  if ((await resolveAccessMode(queryClient, access)) === 'public') return { mode: 'public' };
  return { mode: 'private', session: await requireAuth(queryClient, session, { loginTo, returnTo }) };
}
