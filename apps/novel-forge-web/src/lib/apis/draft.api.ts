import {
  keepPreviousData,
  queryOptions,
  useMutation,
  type UseMutationResult,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import {
  type ApproveDraftBody,
  type ConflictingDraftResponse,
  type ContinuityProposalResponse,
  type DraftConflictResponse,
  type DraftResponse,
  type DraftSummaryResponse,
  type FeedbackBody,
  type FinalizeReadinessResponse,
  type GenerateBody,
  type JobEnqueueResponse,
  type ListChapterRowsQueryParams,
  type ListChapterRowsResponse,
  type ListDraftResponse,
  type ProposalResponse,
  type ReviewQueueResponse,
  type SeedFromBriefBody,
  type UpdateDraftBody,
  type UserFeedbackResponse,
  type WorkflowRunResponse,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const draftKeys = {
  all: (projectId: string) => ['projects', projectId, 'drafts'] as const,
  list: (projectId: string) => [...draftKeys.all(projectId), 'list'] as const,
  summary: (projectId: string) => [...draftKeys.all(projectId), 'summary'] as const,
  rows: (projectId: string, params?: ListChapterRowsQueryParams) => [...draftKeys.all(projectId), 'rows', params] as const,
  detail: (projectId: string, n: number) => [...draftKeys.all(projectId), n] as const,
  revisions: (projectId: string, n: number) => [...draftKeys.all(projectId), n, 'revisions'] as const,
  reviewQueue: (projectId: string) => ['projects', projectId, 'review-queue'] as const,
};

export const listDraftsQueryOptions = (projectId: string): UseQueryOptions<ListDraftResponse, ApiError> =>
  queryOptions<ListDraftResponse, ApiError>({
    queryKey: draftKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts`).execute(),
  });

export function useListDraftsQuery(projectId: string, enabled = true): UseQueryResult<ListDraftResponse, ApiError> {
  return useQuery({ ...listDraftsQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

// Keyed under drafts so every draft mutation refreshes the list; the previous page stays on screen while the next one loads.
export const chapterRowsQueryOptions = (projectId: string, params: ListChapterRowsQueryParams): UseQueryOptions<ListChapterRowsResponse, ApiError> =>
  queryOptions<ListChapterRowsResponse, ApiError>({
    queryKey: draftKeys.rows(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chapter-rows`).query(params).execute(),
    placeholderData: keepPreviousData,
  });

export function useChapterRowsQuery(projectId: string, params: ListChapterRowsQueryParams, enabled = true): UseQueryResult<ListChapterRowsResponse, ApiError> {
  return useQuery({ ...chapterRowsQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

const ROW_MATCH_PAGE = 100;

export interface ChapterRowFilterParams {
  pov?: string;
  thread?: string;
}

export interface ChapterRowMatches {
  /** Chapter numbers matching the filter; undefined while no filter is set or the matches are still loading. */
  chapters?: ReadonlySet<number>;
  isLoading: boolean;
  error: ApiError | null;
}

/** Every chapter a point-of-view or thread filter keeps, gathered across `/chapter-rows` pages of the request maximum. */
export function useChapterRowMatches(projectId: string, filter: ChapterRowFilterParams): ChapterRowMatches {
  const active = Boolean(projectId) && Boolean(filter.pov || filter.thread);
  const pageParams = (offset: number): ListChapterRowsQueryParams => ({ filter: 'all', pov: filter.pov, thread: filter.thread, limit: ROW_MATCH_PAGE, offset });
  const first = useQuery({ ...chapterRowsQueryOptions(projectId, pageParams(0)), placeholderData: undefined, enabled: active });
  const extraPages = Math.max(0, Math.ceil((first.data?.total ?? 0) / ROW_MATCH_PAGE) - 1);
  const rest = useQueries({
    queries: Array.from({ length: extraPages }, (_, index) => ({
      ...chapterRowsQueryOptions(projectId, pageParams((index + 1) * ROW_MATCH_PAGE)),
      placeholderData: undefined,
      enabled: active,
    })),
  });
  if (!active) return { isLoading: false, error: null };
  const pages = [first, ...rest];
  const error = pages.find(page => page.error)?.error ?? null;
  if (pages.some(page => !page.data)) return { isLoading: !error, error };
  return { chapters: new Set(pages.flatMap(page => page.data?.items.map(row => row.chapter) ?? [])), isLoading: false, error };
}

export function useDraftSummaryQuery(projectId: string, enabled = true): UseQueryResult<DraftSummaryResponse, ApiError> {
  return useQuery<DraftSummaryResponse, ApiError>({
    queryKey: draftKeys.summary(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts/summary`).execute(),
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

export const reviewQueueQueryOptions = (projectId: string): UseQueryOptions<ReviewQueueResponse, ApiError> =>
  queryOptions<ReviewQueueResponse, ApiError>({
    queryKey: draftKeys.reviewQueue(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/review-queue`).execute(),
  });

export function useReviewQueueQuery(projectId: string, enabled = true): UseQueryResult<ReviewQueueResponse, ApiError> {
  return useQuery({ ...reviewQueueQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
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

/** A save refused because the draft moved past the base it was made against; `current` is what the chapter holds now, absent when it has no draft. */
export class DraftSaveConflict extends ApiError {
  readonly current?: ConflictingDraftResponse;

  constructor(conflict: DraftConflictResponse & { type?: string }) {
    super(409, { code: conflict.code, type: conflict.type ?? 'CONFLICT', message: conflict.message, fields: conflict.fields });
    this.current = conflict.current;
  }
}

/** A PUT answers 409 with a body, not a throw, so the current draft it carries reaches the editor. */
export function savedDraftOrThrow(payload: DraftResponse | DraftConflictResponse): DraftResponse {
  return resultOrConflict(payload);
}

/** Any draft write read with `modeled(409)`: its refusal is thrown as a {@link DraftSaveConflict}, carrying the current draft when the server sent one. */
export function resultOrConflict<T extends object>(payload: T | DraftConflictResponse): T {
  if (isConflictBody(payload)) throw new DraftSaveConflict(payload);
  return payload;
}

// `modeled` hands back the body without its status, so the refusal is told apart from a result by its own fields.
function isConflictBody<T extends object>(payload: T | DraftConflictResponse): payload is DraftConflictResponse {
  return 'current' in payload || ('code' in payload && typeof payload.code === 'string' && !('id' in payload));
}

/** The editor's own write: it puts the saved draft in the cache itself rather than refetching the whole draft list after every autosave. */
export function useSaveDraftMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, UpdateDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, UpdateDraftBody>({
    mutationFn: async data => {
      const payload = await APIRequest.put(`/projects/${projectId}/drafts/${n}`).body(data).modeled(409).execute<DraftResponse | DraftConflictResponse>();
      return savedDraftOrThrow(payload);
    },
    onSuccess: saved => {
      queryClient.invalidateQueries({ queryKey: draftKeys.all(projectId), refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: draftKeys.reviewQueue(projectId), refetchType: 'none' });
      queryClient.setQueryData(draftKeys.detail(projectId, n), saved);
    },
    onError: error => refetchMovedDraft(queryClient, projectId, error),
  });
}

export function nextDraftPath(projectId: string): string {
  return `/projects/${projectId}/drafts/next`;
}

/** Starts the one chapter the server allows next; the server picks the number. */
export function useStartNextDraftMutation(projectId: string): UseMutationResult<DraftResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(nextDraftPath(projectId)).body({}).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

export function useFinalizeReadinessQuery(projectId: string, n: number, enabled = true): UseQueryResult<FinalizeReadinessResponse, ApiError> {
  return useQuery<FinalizeReadinessResponse, ApiError>({
    queryKey: [...draftKeys.detail(projectId, n), 'finalize-readiness'],
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts/${n}/finalize-readiness`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useDeleteDraftMutation(projectId: string): UseMutationResult<undefined, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, number>({
    mutationFn: n => APIRequest.delete(`/projects/${projectId}/drafts/${n}`).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

export interface ApprovedDraft extends Pick<DraftResponse, 'id' | 'chapter' | 'revision' | 'saveSeq'> {
  /** Approve a stale draft as written; carries the stale reason the author read, so a draft that went stale again since is refused. */
  keptStaleReason?: string;
}

const DRAFT_MOVED_CODES: ReadonlySet<string> = new Set(['DRF_001', 'DRF_002', 'DRF_007', 'DRF_013']);

export function approveDraftRequest(projectId: string, draft: ApprovedDraft): { path: string; body: ApproveDraftBody } {
  const bound: ApproveDraftBody = { draftId: draft.id, revision: draft.revision, saveSeq: draft.saveSeq };
  const body: ApproveDraftBody = draft.keptStaleReason ? { ...bound, keepStale: true, staleReason: draft.keptStaleReason } : bound;
  return { path: `/projects/${projectId}/drafts/${draft.chapter}/approve`, body };
}

/** The write was refused because the draft on screen is no longer the one the server holds. */
export function draftMovedUnderneath(error: ApiError): boolean {
  return DRAFT_MOVED_CODES.has(error.code);
}

function refetchMovedDraft(queryClient: ReturnType<typeof useQueryClient>, projectId: string, error: ApiError): void {
  if (draftMovedUnderneath(error)) invalidateDraft(queryClient, projectId);
}

export function useApproveDraftMutation(projectId: string): UseMutationResult<DraftResponse, ApiError, ApprovedDraft> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, ApprovedDraft>({
    mutationFn: draft => {
      const request = approveDraftRequest(projectId, draft);
      return APIRequest.post(request.path).body(request.body).execute();
    },
    onSuccess: () => invalidateDraft(queryClient, projectId),
    onError: error => refetchMovedDraft(queryClient, projectId, error),
  });
}

export function useReviseDraftMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, { note: string }> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, { note: string }>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/drafts/${n}/revise`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

export function useDraftFeedbackMutation(projectId: string, n: number): UseMutationResult<UserFeedbackResponse, ApiError, FeedbackBody> {
  const queryClient = useQueryClient();
  return useMutation<UserFeedbackResponse, ApiError, FeedbackBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/drafts/${n}/feedback`).body(data).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

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

export function useRegenerateChapterMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<JobEnqueueResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/chapters/${n}/regenerate`).body({}).execute(),
    onSuccess: () => {
      invalidateDraft(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
    },
  });
}

export function useApplyContinuityProposalMutation(projectId: string): UseMutationResult<ContinuityProposalResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<ContinuityProposalResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/chapters/${n}/continuity-proposal/apply`).body({}).execute(),
    // Applying writes entities, appearances, threads, mysteries, relationships and character states — every
    // project-scoped read those feed, not just the drafts/review-queue cache, so this invalidates broadly.
    onSuccess: () => {
      invalidateDraft(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
}

export function useDiscardContinuityProposalMutation(projectId: string): UseMutationResult<ContinuityProposalResponse, ApiError, number> {
  const queryClient = useQueryClient();
  return useMutation<ContinuityProposalResponse, ApiError, number>({
    mutationFn: n => APIRequest.post(`/projects/${projectId}/chapters/${n}/continuity-proposal/discard`).body({}).execute(),
    onSuccess: () => invalidateDraft(queryClient, projectId),
  });
}

export function useExtractToBibleMutation(projectId: string, n: number): UseMutationResult<ProposalResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<ProposalResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/chapters/${n}/extract-to-bible`).body({}).execute(),
    onSuccess: () => {
      invalidateDraft(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'proposals'] });
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
