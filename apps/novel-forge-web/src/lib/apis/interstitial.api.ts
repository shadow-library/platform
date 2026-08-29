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
  type JobEnqueueResponse,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

export function isIsolated(draft: DraftResponse): boolean {
  return draft.isolated;
}

/** Isolated prose is invisible downstream, so finalize refuses it (`CHP_005`) without both fields. */
export function isFinalizeBlocked(draft: DraftResponse): boolean {
  return isIsolated(draft) && (!draft.summary?.trim() || !draft.state || Object.keys(draft.state).length === 0);
}

/** Names the external-write slot that truncated the last generate batch, if any. */
export function externalStopChapter(job: JobEnqueueResponse): number | undefined {
  return job.stoppedAtExternalChapter;
}

function invalidateChapterViews(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'briefs'] });
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

/** Returns the summary and continuation state without persisting either — the author applies them through `PUT /drafts/:n`. */
export function useSummarizeChapterMutation(projectId: string, n: number): UseMutationResult<ChapterSummarizeResponse, ApiError, undefined> {
  return useMutation<ChapterSummarizeResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/chapters/${n}/summarize`).body({}).execute(),
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
