/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError, type PollingOptions } from './api-request';
import { type AiUsageResponse, type AssetsResponse, type CostResponse, type ListGenerationJobResponse } from './api-types.gen';

/**
 * Cross-cutting project insights: AI spend, background jobs, and rendered output.
 */
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

export function useAiUsageQuery(projectId: string, enabled = true): UseQueryResult<AiUsageResponse, ApiError> {
  return useQuery<AiUsageResponse, ApiError>({
    queryKey: insightKeys.aiUsage(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ai-usage`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useListJobsQuery(projectId: string, enabled = true, opts?: PollingOptions): UseQueryResult<ListGenerationJobResponse, ApiError> {
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
