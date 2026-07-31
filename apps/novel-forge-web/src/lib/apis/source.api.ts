/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest } from './api-request';
import { type ConsolidateResponse, type ExtractBody, type JobEnqueueResponse, type SkeletonResponse } from './api-types.gen';

/**
 * Source-pipeline actions for imported source projects: extract a bible from the chapters the
 * novel-import bundle landed, consolidate entities, and build the skeleton. Each enqueues
 * background work, so success invalidates the project's chapters, jobs, and status.
 */
function useSourceInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'chapters'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
  };
}

export function useExtractMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, ExtractBody | undefined> {
  const invalidate = useSourceInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, ExtractBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/extract`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
}

export function useConsolidateMutation(projectId: string): UseMutationResult<ConsolidateResponse, ApiError, undefined> {
  const invalidate = useSourceInvalidation(projectId);
  return useMutation<ConsolidateResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/consolidate`).execute(),
    onSuccess: invalidate,
  });
}

export function useSkeletonMutation(projectId: string): UseMutationResult<SkeletonResponse, ApiError, undefined> {
  const invalidate = useSourceInvalidation(projectId);
  return useMutation<SkeletonResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/skeleton`).execute(),
    onSuccess: invalidate,
  });
}
