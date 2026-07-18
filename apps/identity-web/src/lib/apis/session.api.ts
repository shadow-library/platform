/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type MeSessionItem, type MeSessionsResponse } from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

/** One active session for the signed-in user (`GET /me/sessions`). */
export type SessionItem = MeSessionItem;
export type SessionsResponse = MeSessionsResponse;

/**
 * Declaring the constants
 */
export const sessionKeys = {
  all: ['sessions'] as const,
};

const fetchSessions = createServerFn({ method: 'GET' }).handler(() => serverFetch<SessionsResponse>({ method: 'GET', path: '/me/sessions' }));
const revokeSession = createServerFn({ method: 'POST' })
  .validator((sessionId: string) => sessionId)
  .handler(({ data }) => serverFetch<{ revoked: number }>({ method: 'DELETE', path: `/me/sessions/${encodeURIComponent(data)}` }));
const revokeOtherSessions = createServerFn({ method: 'POST' }).handler(() => serverFetch<{ revoked: number }>({ method: 'DELETE', path: '/me/sessions' }));

export const sessionsQueryOptions = () =>
  queryOptions<SessionsResponse, ApiError>({
    queryKey: sessionKeys.all,
    queryFn: () => call(fetchSessions()),
  });

export function useSessionsQuery(): UseQueryResult<SessionsResponse, ApiError> {
  return useQuery(sessionsQueryOptions());
}

/** Revoke one session (step-up required). Cascades to its refresh-token families server-side. */
export function useRevokeSessionMutation(): UseMutationResult<{ revoked: number }, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, string>({
    mutationFn: sessionId => call(revokeSession({ data: sessionId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

/** Revoke every session except the current one (step-up required). */
export function useRevokeOtherSessionsMutation(): UseMutationResult<{ revoked: number }, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, undefined>({
    mutationFn: () => call(revokeOtherSessions()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
