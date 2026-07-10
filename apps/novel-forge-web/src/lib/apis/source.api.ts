/**
 * Importing npm packages
 */
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type ConsolidateResponse, type ExtractBody, type IngestBody, type JobEnqueueResponse, type ResumeResponse, type SkeletonResponse } from './api-types.gen';

/**
 * Source-pipeline actions for adapted projects: ingest the manuscript, extract a
 * bible from it, consolidate entities, build the skeleton, and resume a stalled
 * pipeline. Each enqueues background work, so success invalidates the project's
 * chapters, jobs, and status.
 */
function useSourceInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'chapters'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
  };
}

export function useIngestMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, IngestBody | undefined> {
  const invalidate = useSourceInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, IngestBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/ingest`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
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

export function useResumeMutation(projectId: string): UseMutationResult<ResumeResponse, ApiError, undefined> {
  const invalidate = useSourceInvalidation(projectId);
  return useMutation<ResumeResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/resume`).execute(),
    onSuccess: invalidate,
  });
}
