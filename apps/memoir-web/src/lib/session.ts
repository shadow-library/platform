import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { requireAuth, type SessionGuardStatus, useSessionGuard as useSharedSessionGuard } from '@shadow-library/web/router';

import { accountApi, loginUrl, sessionQueryOptions, type SessionResponse } from '@/lib/apis';
import { accountKeys, type OnboardingStatus } from '@/lib/data';
import { safeReturnTo } from '@/lib/return-to';

export function signInUrl(returnTo: unknown): string {
  return loginUrl(safeReturnTo(returnTo));
}

export function currentPage(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * The auth gate for every route group — nothing in Memoir is public. An unauthenticated visitor (401) is
 * redirected to the `/login` shim with the intended destination preserved; a non-401 failure propagates to the
 * route error boundary.
 */
export function requireSession(queryClient: QueryClient, returnTo: string): Promise<SessionResponse> {
  return requireAuth(queryClient, sessionQueryOptions(), { loginTo: '/login', returnTo });
}

/** Re-validates the cached session on navigation and focus, and bounces the moment the server reports it gone. */
export function useSessionGuard(): SessionGuardStatus {
  return useSharedSessionGuard({ query: sessionQueryOptions(), loginTo: '/login' });
}

/**
 * Asks the server for the session's subject on a probe key, so a 401 stays out of the shared session query — that
 * query's error is what `useSessionGuard` redirects on, and an expired session must keep the owner working locally.
 * Only a successful answer naming a different account moves the shared query, which rebuilds the shell.
 */
export async function confirmSessionAccount(queryClient: QueryClient): Promise<string> {
  const shared = sessionQueryOptions();
  const session = await queryClient.fetchQuery({ ...shared, queryKey: [...shared.queryKey, 'probe'], gcTime: 0, staleTime: 0 });
  if (queryClient.getQueryData<SessionResponse>(shared.queryKey)?.sub !== session.sub) queryClient.setQueryData(shared.queryKey, session);
  return session.sub;
}

export const ONBOARDING_PATH = '/onboarding';

const bootOnboardingOptions = (accountId: string) =>
  queryOptions({
    queryKey: ['boot', 'onboarding', accountId] as const,
    queryFn: async (): Promise<OnboardingStatus> => {
      const account = await accountApi.get();
      return { completed: account.onboardingCompletedAt !== null && account.onboardingCompletedAt !== undefined };
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

/** Keyed by account on the router's (dehydrated) client, so the server render and hydration agree on which side of setup the owner is. */
export function onboardingBootQuery(accountId: string): ReturnType<typeof bootOnboardingOptions> {
  return bootOnboardingOptions(accountId);
}

/**
 * Routes the first entry into the shell by onboarding before anything renders — a 307 during the server render. A failed read
 * (500, offline, `ACC_002`) resolves to `undefined` and leaves the decision to the client gate, and once the answer is cached,
 * later navigations are the gate's too: it sees setup complete as soon as the wizard does, which this cache would not.
 */
export async function routeByOnboarding(queryClient: QueryClient, accountId: string, pathname: string): Promise<OnboardingStatus | undefined> {
  const query = onboardingBootQuery(accountId);
  const cached = queryClient.getQueryData(query.queryKey);
  if (cached) return cached;

  const status = await queryClient.fetchQuery(query).catch(() => undefined);
  if (status?.completed === false && pathname !== ONBOARDING_PATH) throw redirect({ to: ONBOARDING_PATH });
  if (status?.completed === true && pathname === ONBOARDING_PATH) throw redirect({ to: '/' });
  return status;
}

/**
 * Hands the boot answer to memoir's own query, stamped with when it was fetched so hydration does not refetch it. Only a finished
 * setup is handed over: onboarding cannot be undone, but a cached "not yet" may be minutes old by the time this account is back.
 */
export function seedOnboardingStatus(routerClient: QueryClient, memoirClient: QueryClient, accountId: string): void {
  const { queryKey } = onboardingBootQuery(accountId);
  const status = routerClient.getQueryData(queryKey);
  if (status?.completed !== true) return;
  memoirClient.setQueryData(accountKeys.onboarding, status, { updatedAt: routerClient.getQueryState(queryKey)?.dataUpdatedAt });
}
