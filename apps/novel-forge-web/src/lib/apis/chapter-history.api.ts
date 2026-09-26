import { keepPreviousData, type QueryClient, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type AppliedPassageResponse,
  type ApplyPassageBody,
  type DraftConflictResponse,
  type DraftResponse,
  type ListDraftVersionResponse,
  type ListPassageSuggestionResponse,
  type ListWriterSnapshotResponse,
  type PassageRequestBody,
  type PassageSuggestionResponse,
  type RestoreVersionBody,
  type VersionComparisonResponse,
  type WriterSnapshotDetailResponse,
} from './api-types.gen';
import { draftMovedUnderneath, resultOrConflict } from './draft.api';
import { draftDetailKey } from './interstitial.api';
import { type ApiError, APIRequest } from './transport';

const SUGGESTION_MOVED_CODES: ReadonlySet<string> = new Set(['PSG_001', 'PSG_003', 'PSG_004', 'PSG_005', 'PSG_006', 'VER_001', 'VER_002']);

// Keyed under the chapter's draft, so every draft write — a save, an approval, a restore — reads them again.
function versionsKey(projectId: string, n: number): readonly unknown[] {
  return [...draftDetailKey(projectId, n), 'versions'];
}

function suggestionsKey(projectId: string, n: number): readonly unknown[] {
  return [...draftDetailKey(projectId, n), 'passage-suggestions'];
}

function snapshotsKey(projectId: string, n: number): readonly unknown[] {
  return ['projects', projectId, 'chapters', n, 'writer-snapshots'];
}

function draftPath(projectId: string, n: number): string {
  return `/projects/${projectId}/drafts/${n}`;
}

/** The new text is put in the cache at once, so the editor follows it before the refetch lands; everything keyed under drafts is read again. */
function storeDraft(queryClient: QueryClient, projectId: string, n: number, draft: DraftResponse): void {
  queryClient.setQueryData(draftDetailKey(projectId, n), draft);
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'review-queue'] });
  queryClient.invalidateQueries({ queryKey: snapshotsKey(projectId, n) });
}

function refetchMoved(queryClient: QueryClient, projectId: string, n: number, error: ApiError): void {
  if (draftMovedUnderneath(error)) queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  else if (SUGGESTION_MOVED_CODES.has(error.code)) queryClient.invalidateQueries({ queryKey: draftDetailKey(projectId, n) });
}

export function useDraftVersionsQuery(projectId: string, n: number, enabled = true): UseQueryResult<ListDraftVersionResponse, ApiError> {
  return useQuery<ListDraftVersionResponse, ApiError>({
    queryKey: versionsKey(projectId, n),
    queryFn: () => APIRequest.get(`${draftPath(projectId, n)}/versions`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export interface VersionPair {
  from: number;
  to: number;
}

export function useCompareVersionsQuery(projectId: string, n: number, pair: VersionPair | undefined): UseQueryResult<VersionComparisonResponse, ApiError> {
  return useQuery<VersionComparisonResponse, ApiError>({
    queryKey: [...versionsKey(projectId, n), 'compare', pair?.from, pair?.to],
    queryFn: () =>
      APIRequest.get(`${draftPath(projectId, n)}/versions/compare`)
        .query({ from: pair?.from, to: pair?.to })
        .execute(),
    enabled: Boolean(projectId) && pair !== undefined && pair.from !== pair.to,
    placeholderData: keepPreviousData,
  });
}

export interface RestoreVersionVariables {
  revision: number;
  base: Required<RestoreVersionBody>;
}

export function useRestoreVersionMutation(projectId: string, n: number): UseMutationResult<DraftResponse, ApiError, RestoreVersionVariables> {
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, ApiError, RestoreVersionVariables>({
    mutationFn: async ({ revision, base }) => {
      const payload = await APIRequest.post(`${draftPath(projectId, n)}/versions/${revision}/restore`)
        .body(base)
        .modeled(409)
        .execute<DraftResponse | DraftConflictResponse>();
      return resultOrConflict(payload);
    },
    onSuccess: draft => storeDraft(queryClient, projectId, n, draft),
    onError: error => refetchMoved(queryClient, projectId, n, error),
  });
}

export function usePassageSuggestionsQuery(projectId: string, n: number, enabled = true): UseQueryResult<ListPassageSuggestionResponse, ApiError> {
  return useQuery<ListPassageSuggestionResponse, ApiError>({
    queryKey: suggestionsKey(projectId, n),
    queryFn: () => APIRequest.get(`${draftPath(projectId, n)}/passage-suggestions`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useRequestPassageMutation(projectId: string, n: number): UseMutationResult<PassageSuggestionResponse, ApiError, PassageRequestBody> {
  const queryClient = useQueryClient();
  return useMutation<PassageSuggestionResponse, ApiError, PassageRequestBody>({
    mutationFn: async body => {
      const payload = await APIRequest.post(`${draftPath(projectId, n)}/passage-suggestions`)
        .body(body)
        .modeled(409)
        .execute<PassageSuggestionResponse | DraftConflictResponse>();
      return resultOrConflict(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suggestionsKey(projectId, n) });
      queryClient.invalidateQueries({ queryKey: snapshotsKey(projectId, n) });
    },
    onError: error => refetchMoved(queryClient, projectId, n, error),
  });
}

export interface ApplyPassageVariables {
  suggestionId: string;
  base: Required<ApplyPassageBody>;
}

export function useApplyPassageMutation(projectId: string, n: number): UseMutationResult<AppliedPassageResponse, ApiError, ApplyPassageVariables> {
  const queryClient = useQueryClient();
  return useMutation<AppliedPassageResponse, ApiError, ApplyPassageVariables>({
    mutationFn: async ({ suggestionId, base }) => {
      const payload = await APIRequest.post(`${draftPath(projectId, n)}/passage-suggestions/${suggestionId}/apply`)
        .body(base)
        .modeled(409)
        .execute<AppliedPassageResponse | DraftConflictResponse>();
      return resultOrConflict(payload);
    },
    onSuccess: applied => storeDraft(queryClient, projectId, n, applied.draft),
    onError: error => refetchMoved(queryClient, projectId, n, error),
  });
}

export function useDismissPassageMutation(projectId: string, n: number): UseMutationResult<PassageSuggestionResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<PassageSuggestionResponse, ApiError, string>({
    mutationFn: suggestionId =>
      APIRequest.post(`${draftPath(projectId, n)}/passage-suggestions/${suggestionId}/dismiss`)
        .body({})
        .execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: suggestionsKey(projectId, n) }),
    onError: error => refetchMoved(queryClient, projectId, n, error),
  });
}

export function useWriterSnapshotsQuery(projectId: string, n: number, enabled = true): UseQueryResult<ListWriterSnapshotResponse, ApiError> {
  return useQuery<ListWriterSnapshotResponse, ApiError>({
    queryKey: snapshotsKey(projectId, n),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chapters/${n}/writer-snapshots`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useWriterSnapshotQuery(projectId: string, n: number, snapshotId: string | undefined): UseQueryResult<WriterSnapshotDetailResponse, ApiError> {
  return useQuery<WriterSnapshotDetailResponse, ApiError>({
    queryKey: [...snapshotsKey(projectId, n), snapshotId],
    queryFn: () => APIRequest.get(`/projects/${projectId}/chapters/${n}/writer-snapshots/${snapshotId}`).execute(),
    enabled: Boolean(projectId) && snapshotId !== undefined,
    staleTime: Infinity,
  });
}
