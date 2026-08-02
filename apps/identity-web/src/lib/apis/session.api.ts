/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type MeSessionItem, type MeSessionsResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

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

export const sessionsQueryOptions = () =>
  queryOptions<SessionsResponse, ApiError>({
    queryKey: sessionKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me/sessions').signal(signal).execute<SessionsResponse>(),
  });

export function useSessionsQuery(): UseQueryResult<SessionsResponse, ApiError> {
  return useQuery(sessionsQueryOptions());
}

/** Revoke one session (step-up required). Cascades to its refresh-token families server-side. */
export function useRevokeSessionMutation(): UseMutationResult<{ revoked: number }, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, string>({
    mutationFn: sessionId => APIRequest.delete(`/me/sessions/${encodeURIComponent(sessionId)}`).execute<{ revoked: number }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

/** Revoke every session except the current one (step-up required). */
export function useRevokeOtherSessionsMutation(): UseMutationResult<{ revoked: number }, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, undefined>({
    mutationFn: () => APIRequest.delete('/me/sessions').execute<{ revoked: number }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
