import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type ApproveTranslationTermBody,
  type ChapterTranslationStatus,
  type CreateTranslationTermBody,
  type EditTranslationBody,
  type FinalizeChapterResponse,
  type JobEnqueueResponse,
  type OriginalChapterBody,
  type OriginalChapterResponse,
  type TranslationChapterDetailResponse,
  type TranslationChapterListResponse,
  type TranslationConfigBody,
  type TranslationGlossaryCategory,
  type TranslationGlossaryListResponse,
  type TranslationGlossaryStatus,
  type TranslationManuscriptResponse,
  type TranslationResponse,
  type TranslationStartBody,
  type TranslationStatusResponse,
  type TranslationTermDecision,
  type TranslationTermDecisionsResponse,
  type TranslationTermResponse,
  type TranslationTreatment,
  type UpdateTranslationTermBody,
} from './api-types.gen';
import { livePolling } from './live-polling';
import { ApiError, APIRequest } from './transport';

export interface TranslationChapterListParams {
  page?: number;
  limit?: number;
  status?: ChapterTranslationStatus;
  stale?: boolean;
}

export interface TranslationGlossaryParams {
  page?: number;
  limit?: number;
  status?: TranslationGlossaryStatus;
  category?: TranslationGlossaryCategory;
  treatment?: TranslationTreatment;
  q?: string;
}

/** The status response types the latest translate job as a freeform blob; this is the slice the screen reads off it. */
export interface TranslationJob {
  id: string;
  status: string;
  lastError?: string | null;
  progress?: { phase?: string; done?: number; total?: number; current?: string | number } | null;
}

export function translationJob(status?: TranslationStatusResponse): TranslationJob | null {
  return (status?.job as TranslationJob | null | undefined) ?? null;
}

export function translationJobActive(status?: TranslationStatusResponse): boolean {
  const job = translationJob(status);
  return job?.status === 'pending' || job?.status === 'in_progress';
}

export type UpsertOriginalOutcome = 'created' | 'updated' | 'unchanged';

export interface UpsertOriginalVariables extends OriginalChapterBody {
  chapter: number;
}

export interface UpsertOriginalResult {
  chapter: number;
  outcome: UpsertOriginalOutcome;
}

export interface EditTranslationVariables extends EditTranslationBody {
  chapter: number;
}

export interface TranslationTermVariables extends UpdateTranslationTermBody {
  id: string;
}

export interface ApproveTermVariables extends ApproveTranslationTermBody {
  id: string;
}

export const translationKeys = {
  all: (projectId: string) => ['projects', projectId, 'translation'] as const,
  status: (projectId: string) => [...translationKeys.all(projectId), 'status'] as const,
  chapters: (projectId: string, params: TranslationChapterListParams) => [...translationKeys.all(projectId), 'chapters', params] as const,
  chapter: (projectId: string, chapter: number) => [...translationKeys.all(projectId), 'chapters', chapter] as const,
  glossary: (projectId: string, params: TranslationGlossaryParams) => [...translationKeys.all(projectId), 'glossary', params] as const,
  original: (projectId: string, chapter: number) => [...translationKeys.all(projectId), 'originals', chapter] as const,
};

/** Chapter and glossary lists sit under `all`, so one subtree invalidation covers the staleness a glossary decision creates. */
function useTranslationInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: translationKeys.all(projectId) });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
  };
}

export function useTranslationStatusQuery(projectId: string, enabled = true): UseQueryResult<TranslationStatusResponse, ApiError> {
  return useQuery<TranslationStatusResponse, ApiError>({
    queryKey: translationKeys.status(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation`).execute(),
    enabled: enabled && Boolean(projectId),
    refetchInterval: livePolling(projectId, query => (translationJobActive(query.state.data) ? 2500 : false)),
  });
}

export function useTranslationChaptersQuery(projectId: string, params: TranslationChapterListParams, refetch = false): UseQueryResult<TranslationChapterListResponse, ApiError> {
  return useQuery<TranslationChapterListResponse, ApiError>({
    queryKey: translationKeys.chapters(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation/chapters`).query(params).execute(),
    enabled: Boolean(projectId),
    refetchInterval: livePolling(projectId, refetch ? 2500 : undefined),
  });
}

/**
 * The highest chapter carrying an original. The list is ascending and filtered to chapters that have one,
 * so the last row of a one-row page at `originals` is it — one tiny request instead of paging the list.
 * Chapter numbers need not start at 1 on a project whose originals were pushed from another app.
 */
export function useLastOriginalChapterQuery(projectId: string, originals: number): UseQueryResult<TranslationChapterListResponse, ApiError> {
  const params = { page: Math.max(originals, 1), limit: 1 };
  return useQuery<TranslationChapterListResponse, ApiError>({
    queryKey: translationKeys.chapters(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation/chapters`).query(params).execute(),
    enabled: Boolean(projectId) && originals > 0,
  });
}

export function useTranslationChapterQuery(projectId: string, chapter: number | null): UseQueryResult<TranslationChapterDetailResponse, ApiError> {
  return useQuery<TranslationChapterDetailResponse, ApiError>({
    queryKey: translationKeys.chapter(projectId, chapter ?? 0),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation/chapters/${chapter}`).execute(),
    enabled: Boolean(projectId) && chapter !== null,
    // A chapter with an original but no translation row answers 404 TRN_002; the reader falls back to the original.
    retry: false,
  });
}

export function useTranslationOriginalQuery(projectId: string, chapter: number | null, enabled = true): UseQueryResult<OriginalChapterResponse, ApiError> {
  return useQuery<OriginalChapterResponse, ApiError>({
    queryKey: translationKeys.original(projectId, chapter ?? 0),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation/originals/${chapter}`).execute(),
    enabled: enabled && Boolean(projectId) && chapter !== null,
    retry: false,
  });
}

export function useTranslationGlossaryQuery(projectId: string, params: TranslationGlossaryParams, enabled = true): UseQueryResult<TranslationGlossaryListResponse, ApiError> {
  return useQuery<TranslationGlossaryListResponse, ApiError>({
    queryKey: translationKeys.glossary(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/translation/glossary`).query(params).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useUpdateTranslationConfigMutation(projectId: string): UseMutationResult<TranslationResponse, ApiError, TranslationConfigBody> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationResponse, ApiError, TranslationConfigBody>({
    mutationFn: body => APIRequest.put(`/projects/${projectId}/translation/config`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useStartTranslationMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, TranslationStartBody | undefined> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, TranslationStartBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/translation`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
}

export function useRerunTranslationChapterMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, number> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, number>({
    mutationFn: chapter => APIRequest.post(`/projects/${projectId}/translation/chapters/${chapter}`).body({}).execute(),
    onSuccess: invalidate,
  });
}

/**
 * The door answers 201 created / 200 overwritten / 204 unchanged, but the transport keeps only the body,
 * so the outcome is read off the original this client already holds rather than the status line.
 */
export function useUpsertOriginalMutation(projectId: string): UseMutationResult<UpsertOriginalResult, ApiError, UpsertOriginalVariables> {
  const queryClient = useQueryClient();
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<UpsertOriginalResult, ApiError, UpsertOriginalVariables>({
    mutationFn: async ({ chapter, title, content }) => {
      const known = queryClient.getQueryData<OriginalChapterResponse>(translationKeys.original(projectId, chapter));
      await APIRequest.put(`/projects/${projectId}/translation/originals/${chapter}`).body({ title, content }).execute();
      if (!known) return { chapter, outcome: 'created' };
      return { chapter, outcome: known.title === title && known.content === content ? 'unchanged' : 'updated' };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteOriginalMutation(projectId: string): UseMutationResult<undefined, ApiError, number> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<undefined, ApiError, number>({
    mutationFn: chapter => APIRequest.delete(`/projects/${projectId}/translation/originals/${chapter}`).execute(),
    onSuccess: invalidate,
  });
}

export function useEditTranslationMutation(projectId: string): UseMutationResult<TranslationChapterDetailResponse, ApiError, EditTranslationVariables> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationChapterDetailResponse, ApiError, EditTranslationVariables>({
    mutationFn: ({ chapter, ...body }) => APIRequest.put(`/projects/${projectId}/translation/chapters/${chapter}`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useFinalizeTranslationChapterMutation(projectId: string): UseMutationResult<FinalizeChapterResponse, ApiError, number> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<FinalizeChapterResponse, ApiError, number>({
    mutationFn: chapter => APIRequest.post(`/projects/${projectId}/translation/chapters/${chapter}/finalize`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function useReopenTranslationChapterMutation(projectId: string): UseMutationResult<TranslationChapterDetailResponse, ApiError, number> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationChapterDetailResponse, ApiError, number>({
    mutationFn: chapter => APIRequest.post(`/projects/${projectId}/translation/chapters/${chapter}/reopen`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function useCreateTranslationTermMutation(projectId: string): UseMutationResult<TranslationTermResponse, ApiError, CreateTranslationTermBody> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationTermResponse, ApiError, CreateTranslationTermBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/translation/glossary`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useUpdateTranslationTermMutation(projectId: string): UseMutationResult<TranslationTermResponse, ApiError, TranslationTermVariables> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationTermResponse, ApiError, TranslationTermVariables>({
    mutationFn: ({ id, ...body }) => APIRequest.patch(`/projects/${projectId}/translation/glossary/${id}`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useApproveTranslationTermMutation(projectId: string): UseMutationResult<TranslationTermResponse, ApiError, ApproveTermVariables> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationTermResponse, ApiError, ApproveTermVariables>({
    mutationFn: ({ id, ...body }) => APIRequest.post(`/projects/${projectId}/translation/glossary/${id}/approve`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useRejectTranslationTermMutation(projectId: string): UseMutationResult<TranslationTermResponse, ApiError, string> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationTermResponse, ApiError, string>({
    mutationFn: id => APIRequest.post(`/projects/${projectId}/translation/glossary/${id}/reject`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function useTranslationTermDecisionsMutation(projectId: string): UseMutationResult<TranslationTermDecisionsResponse, ApiError, TranslationTermDecision[]> {
  const invalidate = useTranslationInvalidation(projectId);
  return useMutation<TranslationTermDecisionsResponse, ApiError, TranslationTermDecision[]>({
    mutationFn: decisions => APIRequest.post(`/projects/${projectId}/translation/glossary/decisions`).body({ decisions }).execute(),
    onSuccess: invalidate,
  });
}

export function fetchTranslationManuscript(projectId: string): Promise<TranslationManuscriptResponse> {
  return APIRequest.get(`/projects/${projectId}/translation/manuscript`).execute();
}
