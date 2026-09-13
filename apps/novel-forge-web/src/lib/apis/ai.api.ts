import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type AccountSettingsResponse, type AiModelsResponse, type UpdateAccountSettingsBody } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const aiKeys = {
  models: () => ['ai', 'models'] as const,
  settings: () => ['ai', 'settings'] as const,
};

export const aiModelsQueryOptions = (): UseQueryOptions<AiModelsResponse, ApiError> =>
  queryOptions<AiModelsResponse, ApiError>({
    queryKey: aiKeys.models(),
    queryFn: () => APIRequest.get('/ai/models').execute(),
    staleTime: 5 * 60 * 1000,
  });

export function useAiModelsQuery(): UseQueryResult<AiModelsResponse, ApiError> {
  return useQuery(aiModelsQueryOptions());
}

export const accountSettingsQueryOptions = (): UseQueryOptions<AccountSettingsResponse, ApiError> =>
  queryOptions<AccountSettingsResponse, ApiError>({
    queryKey: aiKeys.settings(),
    queryFn: () => APIRequest.get('/ai/settings').execute(),
    staleTime: 5 * 60 * 1000,
  });

export function useAccountSettingsQuery(): UseQueryResult<AccountSettingsResponse, ApiError> {
  return useQuery(accountSettingsQueryOptions());
}

export function useUpdateAccountSettingsMutation(): UseMutationResult<AccountSettingsResponse, ApiError, UpdateAccountSettingsBody> {
  const queryClient = useQueryClient();
  return useMutation<AccountSettingsResponse, ApiError, UpdateAccountSettingsBody>({
    mutationFn: data => APIRequest.put('/ai/settings').body(data).execute(),
    onSuccess: settings => queryClient.setQueryData(aiKeys.settings(), settings),
  });
}
