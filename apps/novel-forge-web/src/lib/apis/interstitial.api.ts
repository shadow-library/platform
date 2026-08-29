import { type ContentRating } from '@shadow-library/sdk';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { type BriefResponse, type DraftResponse, type JobEnqueueResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * TEMPORARY STAND-IN — delete this whole file once `api-types.gen.ts` is regenerated against a running
 * novel-forge-server (`bun scripts/gen-api-types.ts novel-forge-web`), then re-point these imports at the
 * generated names, which are identical. The generated file is eleven commits stale and cannot be refreshed
 * without a Postgres the generator can boot the server against. Every shape below mirrors a DTO in
 * `apps/novel-forge-server/src/modules/generation/generation.dto.ts` by hand; nothing here is invented.
 */

export interface InsertChapterBody {
  /** `'hand'` takes `briefBody` verbatim; `'planner'` drafts the brief from `intent`. */
  briefOrigin: 'hand' | 'planner';
  briefBody?: string;
  intent?: string;
}

export interface InsertChapterResponse {
  brief: BriefResponse;
  newChapter: number;
  shiftedChapters: number;
}

export interface GenerateUnrestrictedBody {
  guidance?: string;
  /** Omission keeps the stored rating; an empty object clears it back to unrated. */
  contentRating?: ContentRating;
}

export interface ImportDraftBody {
  prose: string;
  title?: string;
  summary?: string;
  contentRating?: ContentRating;
  state?: Record<string, unknown>;
  /** Firewalls the prose from the index, continuity extraction, and the adjacency rule. */
  isolated?: boolean;
}

export interface ChapterSummarizeResponse {
  summary: string;
  state: Record<string, unknown>;
}

export interface AmendChapterBody {
  content: string;
  title?: string;
  note?: string;
  contentRating?: ContentRating;
}

export interface AmendChapterResponse {
  chapter: number;
  wordCount: number;
  indexed: boolean;
  republished: boolean;
  publicationRevision?: number;
  /** Always true — amend replaces prose only, so canon already derived from this chapter keeps propagating. */
  suggestExtractToBible: boolean;
}

/**
 * `DraftResponse` does not carry `chapters.isolated`, so `generator` is the only isolation signal on the
 * wire. It is exact for generated chapters (the containment column was backfilled from it) and misses only
 * prose pasted with `isolated: true`, which still reports `'human'`. Fix this here when the read model
 * gains the column rather than at the call sites.
 */
export function isIsolated(draft: DraftResponse): boolean {
  return draft.generator === 'unrestricted';
}

/** Isolated prose is invisible downstream, so finalize refuses it (`CHP_005`) without both fields. */
export function isFinalizeBlocked(draft: DraftResponse): boolean {
  return isIsolated(draft) && (!draft.summary?.trim() || !draft.state || Object.keys(draft.state).length === 0);
}

/** `JobEnqueueResponse` predates the field; it names the external-write slot that truncated the batch. */
export function externalStopChapter(job: JobEnqueueResponse): number | undefined {
  return (job as JobEnqueueResponse & { stoppedAtExternalChapter?: number }).stoppedAtExternalChapter;
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
