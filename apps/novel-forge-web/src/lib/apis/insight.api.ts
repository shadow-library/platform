import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from '@shadow-library/ui';

import { type AiUsageResponse, type CancelJobResponse, type ListGenerationJobResponse } from './api-types.gen';
import { invalidateSoon } from './batched-invalidation';
import { livePolling } from './live-polling';
import { ApiError, APIRequest, type PollingOptions } from './transport';

const insightKeys = {
  aiUsage: (projectId: string) => ['projects', projectId, 'ai-usage'] as const,
  jobs: (projectId: string) => ['projects', projectId, 'jobs'] as const,
  assets: (projectId: string) => ['projects', projectId, 'assets'] as const,
  cost: (projectId: string) => ['projects', projectId, 'cost'] as const,
};

export const aiUsageQueryOptions = (projectId: string): UseQueryOptions<AiUsageResponse, ApiError> =>
  queryOptions<AiUsageResponse, ApiError>({
    queryKey: insightKeys.aiUsage(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/ai-usage`).execute(),
  });

export function useAiUsageQuery(projectId: string, enabled = true): UseQueryResult<AiUsageResponse, ApiError> {
  return useQuery({ ...aiUsageQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export const hasActiveJob = (data?: ListGenerationJobResponse): boolean => data?.items.some(job => job.status === 'pending' || job.status === 'in_progress') ?? false;

export function useListJobsQuery(projectId: string, enabled = true, opts?: PollingOptions<ListGenerationJobResponse>): UseQueryResult<ListGenerationJobResponse, ApiError> {
  return useQuery<ListGenerationJobResponse, ApiError>({
    queryKey: insightKeys.jobs(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/jobs`).execute(),
    enabled: enabled && Boolean(projectId),
    refetchInterval: livePolling(projectId, opts?.refetchInterval),
  });
}

export function invalidateJobs(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: insightKeys.jobs(projectId) });
}

/** Cancels a queued or running job (S7). Generic to any `JobKind` — the worker converts it per D5. */
export function useCancelJobMutation(projectId: string): UseMutationResult<CancelJobResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<CancelJobResponse, ApiError, string>({
    mutationFn: jobId => APIRequest.post(`/projects/${projectId}/jobs/${jobId}/cancel`).execute(),
    onSuccess: () => invalidateJobs(queryClient, projectId),
  });
}

export interface JobStopAction {
  stop: (jobId: string) => void;
  stopping: boolean;
}

/** Idempotent Stop for a live job: the ref guard blocks a double-press before the mutation resolves, mirroring the chat turn's own `stop`. */
export function useJobStop(projectId: string): JobStopAction {
  const cancelJob = useCancelJobMutation(projectId);
  const stoppingRef = useRef(false);
  const stop = (jobId: string): void => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cancelJob.mutate(jobId, {
      onSettled: () => {
        stoppingRef.current = false;
      },
      onError: err => toast.danger(err.message),
    });
  };
  return { stop, stopping: cancelJob.isPending };
}
