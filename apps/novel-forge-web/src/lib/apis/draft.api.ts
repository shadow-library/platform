/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type DraftResponse, type GenerateBody, type ListDraftResponse, type ListDraftRevisionResponse, type ReviewQueueResponse, type UpdateDraftBody } from './api-types.gen';

/**
 * Drafts are the generated chapters of a project (distinct from ingested source
 * chapters). They back the editor, review/diff, versions, and approvals screens.
 */
const draftKeys = {
  all: (projectId: string) => ['projects', projectId, 'drafts'] as const,
  list: (projectId: string) => [...draftKeys.all(projectId), 'list'] as const,
  detail: (projectId: string, n: number) => [...draftKeys.all(projectId), n] as const,
  revisions: (projectId: string, n: number) => [...draftKeys.all(projectId), n, 'revisions'] as const,
  reviewQueue: (projectId: string) => ['projects', projectId, 'review-queue'] as const,
};

export function useListDraftsQuery(projectId: string, enabled = true): UseQueryResult<ListDraftResponse, ApiError> {
  return useQuery<ListDraftResponse, ApiError>({
    queryKey: draftKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useDraftQuery(projectId: string, n: number | undefined, enabled = true): UseQueryResult<DraftResponse, ApiError> {
  return useQuery<DraftResponse, ApiError>({
    queryKey: draftKeys.detail(projectId, n ?? -1),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts/${n}`).execute(),
    enabled: enabled && Boolean(projectId) && n !== undefined,
  });
}

export function useDraftRevisionsQuery(projectId: string, n: number | undefined, enabled = true): UseQueryResult<ListDraftRevisionResponse, ApiError> {
  return useQuery<ListDraftRevisionResponse, ApiError>({
    queryKey: draftKeys.revisions(projectId, n ?? -1),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts/${n}/revisions`).execute(),
    enabled: enabled && Boolean(projectId) && n !== undefined,
  });
}

export function useReviewQueueQuery(projectId: string, enabled = true): UseQueryResult<ReviewQueueResponse, ApiError> {
  return useQuery<ReviewQueueResponse, ApiError>({
    queryKey: draftKeys.reviewQueue(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/review-queue`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

function invalidateDraft(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: draftKeys.all(projectId) });
  queryClient.invalidateQueries({ queryKey: draftKeys.reviewQueue(projectId) });
}

export function useUpdateDraftMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, UpdateDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, UpdateDraftBody>({
    mutationFn: data => APIRequest.put(`/projects/${projectId}/drafts/${n}`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

export function useApproveDraftMutation(projectId: string): UseMutationResult<DraftResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/drafts/${n}/approve`).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

/** Kicks off backend chapter generation. The endpoint enqueues work and returns no body. */
export function useGenerateMutation(projectId: string): UseMutationResult<undefined, ApiError, GenerateBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, GenerateBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/generate`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}
