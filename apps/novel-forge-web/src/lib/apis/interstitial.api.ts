import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import {
  type AmendChapterBody,
  type AmendChapterResponse,
  type ChapterSummarizeResponse,
  type DraftResponse,
  type GenerateUnrestrictedBody,
  type ImportDraftBody,
  type InsertChapterBody,
  type InsertChapterResponse,
  type SummaryConflictResponse,
  type UpdateSummaryBody,
} from './api-types.gen';
import { DraftSaveConflict } from './draft.api';
import { ApiError, APIRequest } from './transport';

/** DRF_013 for a summary computed against prose that has since moved; `attemptedSummary` is the computed text, so it can be offered again instead of paying for another model call. */
export class SummaryConflictError extends DraftSaveConflict {
  readonly attemptedSummary: string;

  constructor(conflict: SummaryConflictResponse & { type?: string }) {
    super(conflict);
    this.attemptedSummary = conflict.attemptedSummary;
  }
}

function summarizedOrThrow(payload: ChapterSummarizeResponse | SummaryConflictResponse): ChapterSummarizeResponse {
  if ('attemptedSummary' in payload) throw new SummaryConflictError(payload);
  return payload;
}

export function isIsolated(draft: Pick<DraftResponse, 'isolated'>): boolean {
  return draft.isolated;
}

/** Every chapter needs a summary (`CHP_010`); isolated prose is invisible downstream too, so it also needs continuation state (`CHP_005`). */
export function isFinalizeBlocked(draft: Pick<DraftResponse, 'isolated' | 'summary' | 'state'>): boolean {
  if (!draft.summary?.trim()) return true;
  return isIsolated(draft) && (!draft.state || Object.keys(draft.state).length === 0);
}

function invalidateChapterViews(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'briefs'] });
}

export function draftDetailKey(projectId: string, n: number): readonly [string, string, string, number] {
  return ['projects', projectId, 'drafts', n] as const;
}

function invalidateSummaryViews(queryClient: ReturnType<typeof useQueryClient>, projectId: string, n: number): void {
  invalidateChapterViews(queryClient, projectId);
  queryClient.invalidateQueries({ queryKey: [...draftDetailKey(projectId, n), 'finalize-readiness'] });
}

export function useInsertChapterMutation(projectId: string): UseMutationResult<InsertChapterResponse, ApiError, { afterChapter: number; body: InsertChapterBody }> {
  const queryClient = useQueryClient();
  return useMutation<InsertChapterResponse, ApiError, { afterChapter: number; body: InsertChapterBody }>({
    mutationFn: ({ afterChapter, body }) => APIRequest.post(`/projects/${projectId}/chapters/${afterChapter}/insert`).body(body).execute(),
    onSuccess: () => {
      invalidateChapterViews(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'volumes'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
    },
  });
}

export function useGenerateUnrestrictedMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, GenerateUnrestrictedBody> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, GenerateUnrestrictedBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chapters/${n}/generate-unrestricted`).body(body).execute(),
    onSuccess: () => invalidateChapterViews(queryClient, projectId),
  });
}

export function useImportDraftMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, ImportDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, ImportDraftBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/drafts/${n}/import`).body(body).execute(),
    onSuccess: () => invalidateChapterViews(queryClient, projectId),
  });
}

/** A non-isolated chapter's summary is saved here and comes back with its new `saveSeq`, set into the cache exactly so an edit-then-Save right after never trips a false DRF_013. `saveSeq` absent (isolated) leaves the cache alone. A conflict throws `SummaryConflictError` with the computed summary. */
export function useSummarizeChapterMutation(projectId: string, n: number): UseMutationResult<ChapterSummarizeResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<ChapterSummarizeResponse, ApiError, undefined>({
    mutationFn: async () => {
      const payload = await APIRequest.post(`/projects/${projectId}/chapters/${n}/summarize`).body({}).modeled(409).execute<ChapterSummarizeResponse | SummaryConflictResponse>();
      return summarizedOrThrow(payload);
    },
    onSuccess: result => {
      if (result.saveSeq === undefined) return;
      const saveSeq = result.saveSeq;
      queryClient.setQueryData<DraftResponse | undefined>(draftDetailKey(projectId, n), current => (current ? { ...current, summary: result.summary, saveSeq } : current));
      invalidateSummaryViews(queryClient, projectId, n);
    },
  });
}

/** The author's own summary, saved through `PUT /chapters/:n/summary` — works on a final chapter too. */
export function useSaveSummaryMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, UpdateSummaryBody> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, UpdateSummaryBody>({
    mutationFn: body => APIRequest.put(`/projects/${projectId}/chapters/${n}/summary`).body(body).execute(),
    onSuccess: saved => {
      queryClient.setQueryData(draftDetailKey(projectId, n), saved);
      invalidateSummaryViews(queryClient, projectId, n);
    },
  });
}

export function useAmendChapterMutation(projectId: string, n: number): UseMutationResult<AmendChapterResponse, ApiError, AmendChapterBody> {
  const queryClient = useQueryClient();
  return useMutation<AmendChapterResponse, ApiError, AmendChapterBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chapters/${n}/amend`).body(body).execute(),
    onSuccess: () => {
      invalidateChapterViews(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'publications'] });
    },
  });
}
