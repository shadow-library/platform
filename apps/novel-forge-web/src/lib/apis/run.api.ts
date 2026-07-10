/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError, type PollingOptions } from './api-request';
import { type ListWorkflowRunResponse, type WorkflowRunDetailResponse } from './api-types.gen';

/**
 * Workflow runs are the orchestrator's execution records — every generate, judge,
 * repair, or plan step. They back the Workflow Runs screen (list + detail ladder).
 */
const runKeys = {
  all: (projectId: string) => ['projects', projectId, 'runs'] as const,
  detail: (projectId: string, runId: string) => [...runKeys.all(projectId), runId] as const,
};

export function useListRunsQuery(projectId: string, enabled = true, opts?: PollingOptions): UseQueryResult<ListWorkflowRunResponse, ApiError> {
  return useQuery<ListWorkflowRunResponse, ApiError>({
    queryKey: runKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs`).execute(),
    enabled: enabled && Boolean(projectId),
    refetchInterval: opts?.refetchInterval,
  });
}

export function useRunQuery(projectId: string, runId: string | undefined, enabled = true): UseQueryResult<WorkflowRunDetailResponse, ApiError> {
  return useQuery<WorkflowRunDetailResponse, ApiError>({
    queryKey: runKeys.detail(projectId, runId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/runs/${runId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(runId),
  });
}
