import { keepPreviousData, type QueryClient, queryOptions, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  type ListRunsQueryParams,
  type ListWorkflowRunResponse,
  type RunContextResponse,
  type RunModelCallDetailResponse,
  type RunUsageDetailResponse,
  type WorkflowRunDetailResponse,
  type WorkflowRunListItemResponse,
} from './api-types.gen';
import { invalidateAccountUsage } from './ai.api';
import { invalidateProjectCost } from './insight.api';
import { invalidateSoon } from './batched-invalidation';
import { livePolling } from './live-polling';
import { ApiError, APIRequest, type PollingOptions } from './transport';

const runKeys = {
  all: (projectId: string) => ['projects', projectId, 'runs'] as const,
  detail: (projectId: string, runId: string) => [...runKeys.all(projectId), runId] as const,
  context: (projectId: string, runId: string) => [...runKeys.detail(projectId, runId), 'context'] as const,
  call: (projectId: string, runId: string, callId: string) => [...runKeys.detail(projectId, runId), 'calls', callId] as const,
  usage: (projectId: string, runId: string) => [...runKeys.detail(projectId, runId), 'usage'] as const,
  charges: (projectId: string, params: ListRunsQueryParams) => [...runKeys.all(projectId), 'charges', params] as const,
};

const RUNNING_REFRESH_MS = 4000;

export const listRunsQueryOptions = (projectId: string): UseQueryOptions<ListWorkflowRunResponse, ApiError> =>
  queryOptions<ListWorkflowRunResponse, ApiError>({
    queryKey: runKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs`).execute(),
  });

export const hasRunningRun = (data?: ListWorkflowRunResponse): boolean => data?.items.some(run => run.status === 'running') ?? false;

export function useListRunsQuery(projectId: string, enabled = true, opts?: PollingOptions<ListWorkflowRunResponse>): UseQueryResult<ListWorkflowRunResponse, ApiError> {
  return useQuery({ ...listRunsQueryOptions(projectId), enabled: enabled && Boolean(projectId), refetchInterval: livePolling(projectId, opts?.refetchInterval) });
}

export function invalidateRuns(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: runKeys.all(projectId) });
}

export function useRunQuery(projectId: string, runId: string | undefined, enabled = true): UseQueryResult<WorkflowRunDetailResponse, ApiError> {
  return useQuery<WorkflowRunDetailResponse, ApiError>({
    queryKey: runKeys.detail(projectId, runId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(runId),
  });
}

export function useRunContextQuery(projectId: string, runId: string | undefined, enabled = true): UseQueryResult<RunContextResponse, ApiError> {
  return useQuery<RunContextResponse, ApiError>({
    queryKey: runKeys.context(projectId, runId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}/context`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(runId),
    staleTime: Infinity,
  });
}

export function useRunCallQuery(projectId: string, runId: string, callId: string | undefined, enabled = true): UseQueryResult<RunModelCallDetailResponse, ApiError> {
  return useQuery<RunModelCallDetailResponse, ApiError>({
    queryKey: runKeys.call(projectId, runId, callId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}/calls/${callId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(callId),
    staleTime: Infinity,
  });
}

export function useRunChargesQuery(projectId: string, params: ListRunsQueryParams): UseQueryResult<ListWorkflowRunResponse, ApiError> {
  return useQuery<ListWorkflowRunResponse, ApiError>({
    queryKey: runKeys.charges(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs`).query(params).execute(),
    enabled: Boolean(projectId),
    placeholderData: keepPreviousData,
    refetchInterval: query => (hasRunningRun(query.state.data) ? RUNNING_REFRESH_MS : false),
  });
}

export function useRunUsageQuery(projectId: string, runId: string, live = false): UseQueryResult<RunUsageDetailResponse, ApiError> {
  return useQuery<RunUsageDetailResponse, ApiError>({
    queryKey: runKeys.usage(projectId, runId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}/usage`).execute(),
    enabled: Boolean(projectId) && Boolean(runId),
    refetchInterval: live ? RUNNING_REFRESH_MS : false,
  });
}

export function useSettledRunRefresh(projectId: string, runs: readonly WorkflowRunListItemResponse[] | undefined): void {
  const queryClient = useQueryClient();
  const running = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!runs) return;
    const settled = runs.filter(run => run.status !== 'running' && running.current.has(run.id));
    running.current = new Set(runs.filter(run => run.status === 'running').map(run => run.id));
    if (settled.length === 0) return;
    for (const run of settled) void queryClient.invalidateQueries({ queryKey: runKeys.usage(projectId, run.id) });
    invalidateProjectCost(queryClient, projectId);
    invalidateAccountUsage(queryClient);
  }, [queryClient, projectId, runs]);
}
