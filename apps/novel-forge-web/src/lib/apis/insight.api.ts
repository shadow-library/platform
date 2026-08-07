import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type AiUsageResponse, type AssetsResponse, type CostResponse, type ListGenerationJobResponse } from './api-types.gen';
import { ApiError, APIRequest, type PollingOptions } from './transport';

const insightKeys = {
  aiUsage: (projectId: string) => ['projects', projectId, 'ai-usage'] as const,
  jobs: (projectId: string) => ['projects', projectId, 'jobs'] as const,
  assets: (projectId: string) => ['projects', projectId, 'assets'] as const,
  cost: (projectId: string) => ['projects', projectId, 'cost'] as const,
};

export function useCostQuery(projectId: string, enabled = true): UseQueryResult<CostResponse, ApiError> {
  return useQuery<CostResponse, ApiError>({
    queryKey: insightKeys.cost(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/cost`).execute(),
    enabled: enabled && Boolean(projectId),
    retry: false,
  });
}

export const aiUsageQueryOptions = (projectId: string): UseQueryOptions<AiUsageResponse, ApiError> =>
  queryOptions<AiUsageResponse, ApiError>({
    queryKey: insightKeys.aiUsage(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ai-usage`).execute(),
  });

export function useAiUsageQuery(projectId: string, enabled = true): UseQueryResult<AiUsageResponse, ApiError> {
  return useQuery({ ...aiUsageQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useListJobsQuery(projectId: string, enabled = true, opts?: PollingOptions<ListGenerationJobResponse>): UseQueryResult<ListGenerationJobResponse, ApiError> {
  return useQuery<ListGenerationJobResponse, ApiError>({
    queryKey: insightKeys.jobs(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/jobs`).execute(),
    enabled: enabled && Boolean(projectId),
    refetchInterval: opts?.refetchInterval,
  });
}

export function useAssetsQuery(projectId: string, enabled = true): UseQueryResult<AssetsResponse, ApiError> {
  return useQuery<AssetsResponse, ApiError>({
    queryKey: insightKeys.assets(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/assets`).execute(),
    enabled: enabled && Boolean(projectId),
    retry: false,
  });
}
