import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type ChangePasswordBody, type ChangePasswordResponse, type MeResponse, type UpdateProfileBody } from './api-types.gen';
import { sessionKeys } from './session.api';
import { type ApiError, APIRequest } from './transport';

export type { ChangePasswordBody, MeResponse, UpdateProfileBody };

export const meKeys = {
  all: ['me'] as const,
};

/** A 401 means "no session" and the portal/console guards read it, so this query never retries. */
export const meQueryOptions = (enabled = true) =>
  queryOptions<MeResponse, ApiError>({
    queryKey: meKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me').signal(signal).execute<MeResponse>(),
    retry: false,
    enabled,
  });

export function useMeQuery(enabled = true): UseQueryResult<MeResponse, ApiError> {
  return useQuery(meQueryOptions(enabled));
}

export function useUpdateProfileMutation(): UseMutationResult<MeResponse, ApiError, UpdateProfileBody> {
  const queryClient = useQueryClient();
  return useMutation<MeResponse, ApiError, UpdateProfileBody>({
    mutationFn: body => APIRequest.patch('/me/profile').body(body).execute<MeResponse>(),
    onSuccess: data => queryClient.setQueryData(meKeys.all, data),
  });
}

/** The server signs out every other session, so the sessions list is invalidated; a wrong current password throws `ApiError` (401). */
export function useChangePasswordMutation(): UseMutationResult<ChangePasswordResponse, ApiError, ChangePasswordBody> {
  const queryClient = useQueryClient();
  return useMutation<ChangePasswordResponse, ApiError, ChangePasswordBody>({
    mutationFn: body => APIRequest.post('/me/password').body(body).execute<ChangePasswordResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
