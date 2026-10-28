import { keepPreviousData, type QueryClient, queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type AccountUsageResponse,
  type AiModelsAdminResponse,
  type AiModelsResponse,
  type AiQuotaResponse,
  type ModelsQueryParams,
  type ProjectModelsResponse,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const aiKeys = {
  models: () => ['ai', 'models'] as const,
  adminModels: () => ['ai', 'models', 'admin'] as const,
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

export function invalidateAiModels(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: aiKeys.models() });
}

/** The catalog behind the paces, which the server answers only for `novel-forge:admin`; gate `enabled` on the access check so an author never asks. */
export function useAdminModelsQuery(enabled: boolean): UseQueryResult<AiModelsAdminResponse, ApiError> {
  return useQuery<AiModelsAdminResponse, ApiError>({
    queryKey: aiKeys.adminModels(),
    queryFn: () => APIRequest.get('/ai/models/admin').execute(),
    staleTime: 5 * 60 * 1000,
    enabled,
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
