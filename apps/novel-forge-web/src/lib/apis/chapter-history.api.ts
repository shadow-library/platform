import { keepPreviousData, type QueryClient, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type DraftConflictResponse,
  type DraftResponse,
  type ListDraftVersionResponse,
  type ListWriterSnapshotResponse,
  type RestoreVersionBody,
  type VersionComparisonResponse,
  type WriterSnapshotDetailResponse,
} from './api-types.gen';
import { draftMovedUnderneath, resultOrConflict } from './draft.api';
import { draftDetailKey } from './interstitial.api';
import { type ApiError, APIRequest } from './transport';

const RESTORE_REFUSED_CODES: ReadonlySet<string> = new Set(['VER_001', 'VER_002']);

// Keyed under the chapter's draft, so every draft write — a save, an approval, a restore — reads them again.
function versionsKey(projectId: string, n: number): readonly unknown[] {
  return [...draftDetailKey(projectId, n), 'versions'];
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
  queryClient.invalidateQueries({ queryKey: snapshotsKey(projectId, n) });
}

function refetchMoved(queryClient: QueryClient, projectId: string, n: number, error: ApiError): void {
  if (draftMovedUnderneath(error)) queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  else if (RESTORE_REFUSED_CODES.has(error.code)) queryClient.invalidateQueries({ queryKey: draftDetailKey(projectId, n) });
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
