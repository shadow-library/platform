/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import {
  type DraftResponse,
  type FeedbackBody,
  type GenerateBody,
  type JobEnqueueResponse,
  type ListDraftResponse,
  type ListDraftRevisionResponse,
  type OutlineBody,
  type OutlineResponse,
  type PlanBody,
  type PlanResponse,
  type ReviewQueueResponse,
  type SeedFromBriefBody,
  type UpdateDraftBody,
  type UserFeedbackResponse,
  type WorkflowRunResponse,
} from './api-types.gen';

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
    mutationFn: n => APIRequest.post(`/projects/${projectId}/drafts/${n}/approve`).body({}).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

/** Runs the AI revision pass: the note becomes the feedback the model rewrites the draft against. */
export function useReviseDraftMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, { note: string }> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, { note: string }>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/drafts/${n}/revise`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

/** Records a human review disposition (approve / request revision / reject / comment) against a draft. */
export function useDraftFeedbackMutation(projectId: string, n: number): UseMutationResult<UserFeedbackResponse, ApiError, FeedbackBody> {
  const queryClient = useQueryClient();
  return useMutation<UserFeedbackResponse, ApiError, FeedbackBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/drafts/${n}/feedback`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

/** Kicks off backend chapter generation and returns the enqueued job so callers can track its progress. */
export function useGenerateMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, GenerateBody> {
  const queryClient = useQueryClient();
  return useMutation<JobEnqueueResponse, ApiError, GenerateBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/generate`).body(data).execute(),
    onSuccess: () => {
      invalidateDraft(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
    },
  });
}

/**
 * Bootstraps the whole project from its brief — the bible-builder graph drafts the Story Bible, cast,
 * world, plot, and volume overview in one run. Long-running; invalidates every per-project query so the
 * generated bible/volumes surface everywhere once it lands.
 */
export function useSeedFromBriefMutation(projectId: string): UseMutationResult<WorkflowRunResponse, ApiError, SeedFromBriefBody> {
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, ApiError, SeedFromBriefBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/seed-from-brief`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

/** Generates the structured volume plan (creates draft volumes). Feeds the Volumes & Arcs screen. */
export function usePlanMutation(projectId: string): UseMutationResult<PlanResponse, ApiError, PlanBody> {
  const queryClient = useQueryClient();
  return useMutation<PlanResponse, ApiError, PlanBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/plan`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'volumes'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
    },
  });
}

/** Generates chapter briefs (outlines) from the approved volume plan. Feeds the chapter generator. */
export function useOutlineMutation(projectId: string): UseMutationResult<OutlineResponse, ApiError, OutlineBody | undefined> {
  const queryClient = useQueryClient();
  return useMutation<OutlineResponse, ApiError, OutlineBody | undefined>({
    mutationFn: data =>
      APIRequest.post(`/projects/${projectId}/outline`)
        .body(data ?? {})
        .execute(),
    onSuccess: () => {
      invalidateDraft(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'volumes'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'briefs'] });
    },
  });
}
