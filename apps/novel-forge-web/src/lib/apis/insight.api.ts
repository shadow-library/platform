/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type AiUsageResponse, type AssetsResponse, type ListGenerationJobResponse, type MarkdownResponse } from './api-types.gen';

/**
 * Cross-cutting project insights: AI spend, background jobs, and rendered output.
 */
const insightKeys = {
  aiUsage: (projectId: string) => ['projects', projectId, 'ai-usage'] as const,
  jobs: (projectId: string) => ['projects', projectId, 'jobs'] as const,
  manuscript: (projectId: string) => ['projects', projectId, 'manuscript'] as const,
  assets: (projectId: string) => ['projects', projectId, 'assets'] as const,
};

export function useAiUsageQuery(projectId: string, enabled = true): UseQueryResult<AiUsageResponse, ApiError> {
  return useQuery<AiUsageResponse, ApiError>({
    queryKey: insightKeys.aiUsage(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ai-usage`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useListJobsQuery(projectId: string, enabled = true): UseQueryResult<ListGenerationJobResponse, ApiError> {
  return useQuery<ListGenerationJobResponse, ApiError>({
    queryKey: insightKeys.jobs(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/jobs`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useManuscriptQuery(projectId: string, enabled = true): UseQueryResult<MarkdownResponse, ApiError> {
  return useQuery<MarkdownResponse, ApiError>({
    queryKey: insightKeys.manuscript(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/manuscript`).execute(),
    enabled: enabled && Boolean(projectId),
    retry: false,
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
