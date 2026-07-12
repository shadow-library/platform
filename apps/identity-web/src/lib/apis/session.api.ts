/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type MeSessionItem, type MeSessionsResponse } from './api-types.gen';

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

export function useSessionsQuery(): UseQueryResult<SessionsResponse, ApiError> {
  return useQuery<SessionsResponse, ApiError>({
    queryKey: sessionKeys.all,
    queryFn: () => APIRequest.get('/me/sessions').execute(),
  });
}

/** Revoke one session (step-up required). Cascades to its refresh-token families server-side. */
export function useRevokeSessionMutation(): UseMutationResult<{ revoked: number }, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, string>({
    mutationFn: sessionId => APIRequest.delete(`/me/sessions/${sessionId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

/** Revoke every session except the current one (step-up required). */
export function useRevokeOtherSessionsMutation(): UseMutationResult<{ revoked: number }, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, undefined>({
    mutationFn: () => APIRequest.delete('/me/sessions').execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
