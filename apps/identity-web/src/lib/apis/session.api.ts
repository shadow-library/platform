import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type MeSessionItem, type MeSessionsResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type SessionItem = MeSessionItem;
export type SessionsResponse = MeSessionsResponse;

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

export function useRevokeSessionMutation(): UseMutationResult<{ revoked: number }, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, string>({
    mutationFn: sessionId => APIRequest.delete(`/me/sessions/${encodeURIComponent(sessionId)}`).execute<{ revoked: number }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}

export function useRevokeOtherSessionsMutation(): UseMutationResult<{ revoked: number }, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<{ revoked: number }, ApiError, undefined>({
    mutationFn: () => APIRequest.delete('/me/sessions').execute<{ revoked: number }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
