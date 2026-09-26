import {
  keepPreviousData,
  type QueryClient,
  queryOptions,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  type AccountSettingsResponse,
  type AccountUsageResponse,
  type AiModelsResponse,
  type AiQuotaResponse,
  type ModelsQueryParams,
  type ProjectModelsResponse,
  type UpdateAccountSettingsBody,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const aiKeys = {
  models: () => ['ai', 'models'] as const,
  settings: () => ['ai', 'settings'] as const,
  usage: () => ['ai', 'usage'] as const,
  quota: () => ['ai', 'quota'] as const,
  projectModels: (projectId: string, params: ModelsQueryParams) => ['projects', projectId, 'ai', 'models', params] as const,
};

const QUOTA_REFRESH_MS = 60_000;

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

export const accountUsageQueryOptions = (): UseQueryOptions<AccountUsageResponse, ApiError> =>
  queryOptions<AccountUsageResponse, ApiError>({
    queryKey: aiKeys.usage(),
    queryFn: () => APIRequest.get('/ai/usage').execute(),
  });

export function useAccountUsageQuery(): UseQueryResult<AccountUsageResponse, ApiError> {
  return useQuery(accountUsageQueryOptions());
}

export const aiQuotaQueryOptions = (): UseQueryOptions<AiQuotaResponse, ApiError> =>
  queryOptions<AiQuotaResponse, ApiError>({
    queryKey: aiKeys.quota(),
    queryFn: () => APIRequest.get('/ai/quota').execute(),
  });

export function invalidateAccountUsage(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: aiKeys.usage() });
  void queryClient.invalidateQueries({ queryKey: aiKeys.quota() });
}

export function useAiQuotaQuery(): UseQueryResult<AiQuotaResponse, ApiError> {
  return useQuery({ ...aiQuotaQueryOptions(), refetchInterval: QUOTA_REFRESH_MS });
}

export function useProjectModelsQuery(projectId: string, params: ModelsQueryParams, enabled = true): UseQueryResult<ProjectModelsResponse, ApiError> {
  return useQuery<ProjectModelsResponse, ApiError>({
    queryKey: aiKeys.projectModels(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ai/models`).query(params).execute(),
    enabled: enabled && Boolean(projectId),
    placeholderData: keepPreviousData,
  });
}
