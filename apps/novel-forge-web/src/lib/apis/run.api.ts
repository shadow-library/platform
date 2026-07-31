/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest, type PollingOptions } from './api-request';
import { type ListWorkflowRunResponse, type RunContextResponse, type RunModelCallDetailResponse, type WorkflowRunDetailResponse } from './api-types.gen';

/**
 * Workflow runs are the orchestrator's execution records — every generate, judge,
 * repair, or plan step. They back the Workflow Runs screen (list + detail ladder).
 */
const runKeys = {
  all: (projectId: string) => ['projects', projectId, 'runs'] as const,
  detail: (projectId: string, runId: string) => [...runKeys.all(projectId), runId] as const,
  context: (projectId: string, runId: string) => [...runKeys.detail(projectId, runId), 'context'] as const,
  call: (projectId: string, runId: string, callId: string) => [...runKeys.detail(projectId, runId), 'calls', callId] as const,
};

export const listRunsQueryOptions = (projectId: string): UseQueryOptions<ListWorkflowRunResponse, ApiError> =>
  queryOptions<ListWorkflowRunResponse, ApiError>({
    queryKey: runKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs`).execute(),
  });

export function useListRunsQuery(projectId: string, enabled = true, opts?: PollingOptions): UseQueryResult<ListWorkflowRunResponse, ApiError> {
  return useQuery({ ...listRunsQueryOptions(projectId), enabled: enabled && Boolean(projectId), refetchInterval: opts?.refetchInterval });
}

export function useRunQuery(projectId: string, runId: string | undefined, enabled = true): UseQueryResult<WorkflowRunDetailResponse, ApiError> {
  return useQuery<WorkflowRunDetailResponse, ApiError>({
    queryKey: runKeys.detail(projectId, runId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(runId),
  });
}

/** The exact rendered context that fed the run's prompt — fetched on demand, it can be tens of KB. */
export function useRunContextQuery(projectId: string, runId: string | undefined, enabled = true): UseQueryResult<RunContextResponse, ApiError> {
  return useQuery<RunContextResponse, ApiError>({
    queryKey: runKeys.context(projectId, runId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}/context`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(runId),
    staleTime: Infinity,
  });
}

/** One model call in full (raw output + error) — fetched when the author expands the row. */
export function useRunCallQuery(projectId: string, runId: string, callId: string | undefined, enabled = true): UseQueryResult<RunModelCallDetailResponse, ApiError> {
  return useQuery<RunModelCallDetailResponse, ApiError>({
    queryKey: runKeys.call(projectId, runId, callId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}/calls/${callId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(callId),
    staleTime: Infinity,
  });
}
