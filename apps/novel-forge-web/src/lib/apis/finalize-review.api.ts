import { type QueryClient, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type FinalizeReviewCategory,
  type FinalizeReviewItemDecisionBody,
  type FinalizeReviewResponse,
  type FinalizeReviewSettingsResponse,
  type IsolationBridgeResponse,
  type WorkflowRunResponse,
} from './api-types.gen';
import { draftDetailKey } from './interstitial.api';
import { type ApiError, APIRequest } from './transport';

const PREPARING_POLL_MS = 2000;

/** Refusals that mean the review on screen is no longer the one the server holds, so it is read again. */
const REVIEW_MOVED_CODES: ReadonlySet<string> = new Set(['FRV_001', 'FRV_002', 'FRV_003', 'FRV_004', 'FRV_008', 'FRV_011']);

/** Refusals that mean the chapter on screen is no longer isolated (BRG_001) or no longer final (BRG_002), so the draft is read again. */
const CHAPTER_MOVED_CODES: ReadonlySet<string> = new Set(['BRG_001', 'BRG_002']);

// Keyed under the chapter's draft so an approval, a save or any draft mutation reads the review again.
export function finalizeReviewKey(projectId: string, n: number): readonly [string, string, string, number, string] {
  return [...draftDetailKey(projectId, n), 'finalize-review'] as const;
}

function readinessKey(projectId: string, n: number): readonly [string, string, string, number, string] {
  return [...draftDetailKey(projectId, n), 'finalize-readiness'] as const;
}

export function isolationBridgeKey(projectId: string, n: number): readonly [string, string, string, number, string] {
  return [...draftDetailKey(projectId, n), 'bridge'] as const;
}

function reviewPath(projectId: string, n: number): string {
  return `/projects/${projectId}/drafts/${n}/finalize-review`;
}

export function useFinalizeReviewQuery(projectId: string, n: number, enabled = true): UseQueryResult<FinalizeReviewResponse, ApiError> {
  return useQuery<FinalizeReviewResponse, ApiError>({
    queryKey: finalizeReviewKey(projectId, n),
    queryFn: () => APIRequest.get(reviewPath(projectId, n)).execute(),
    enabled: enabled && Boolean(projectId),
    retry: (count, error) => error.status >= 500 && count < 2,
    refetchInterval: query => (query.state.data?.status === 'preparing' ? PREPARING_POLL_MS : false),
  });
}

// A poll or refetch already in flight would land after this write and put the older review back.
async function storeReview(queryClient: QueryClient, projectId: string, n: number, review: FinalizeReviewResponse): Promise<void> {
  await queryClient.cancelQueries({ queryKey: finalizeReviewKey(projectId, n), exact: true });
  queryClient.setQueryData(finalizeReviewKey(projectId, n), review);
  queryClient.invalidateQueries({ queryKey: readinessKey(projectId, n) });
  queryClient.invalidateQueries({ queryKey: isolationBridgeKey(projectId, n) });
}

function refetchMovedReview(queryClient: QueryClient, projectId: string, n: number, error: ApiError): void {
  if (!REVIEW_MOVED_CODES.has(error.code)) return;
  queryClient.invalidateQueries({ queryKey: finalizeReviewKey(projectId, n) });
  queryClient.invalidateQueries({ queryKey: readinessKey(projectId, n) });
}

function useReviewMutation<TVariables>(
  projectId: string,
  n: number,
  request: (variables: TVariables) => Promise<FinalizeReviewResponse>,
): UseMutationResult<FinalizeReviewResponse, ApiError, TVariables> {
  const queryClient = useQueryClient();
  return useMutation<FinalizeReviewResponse, ApiError, TVariables>({
    mutationFn: request,
    onSuccess: review => storeReview(queryClient, projectId, n, review),
    onError: error => refetchMovedReview(queryClient, projectId, n, error),
  });
}

export function usePrepareFinalizeReviewMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewResponse, ApiError, undefined> {
  return useReviewMutation(projectId, n, () =>
    APIRequest.post(`${reviewPath(projectId, n)}/prepare`)
      .body({})
      .execute(),
  );
}

export function useIsolationBridgeQuery(projectId: string, n: number, enabled = true): UseQueryResult<IsolationBridgeResponse, ApiError> {
  return useQuery<IsolationBridgeResponse, ApiError>({
    queryKey: isolationBridgeKey(projectId, n),
    queryFn: () => APIRequest.get(`/projects/${projectId}/drafts/${n}/bridge`).execute(),
    enabled: enabled && Boolean(projectId),
    retry: (count, error) => error.status >= 500 && count < 2,
  });
}

/** Reads a final isolated chapter's bridge again from its current text, as a bridge-only review the dialog then shows. */
export function usePrepareBridgeMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<FinalizeReviewResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/drafts/${n}/bridge/prepare`).body({}).execute(),
    onSuccess: review => storeReview(queryClient, projectId, n, review),
    onError: error => {
      if (CHAPTER_MOVED_CODES.has(error.code)) queryClient.invalidateQueries({ queryKey: draftDetailKey(projectId, n) });
    },
  });
}

export interface FinalizeReviewDecisionVariables {
  itemId: string;
  body: FinalizeReviewItemDecisionBody;
}

export function useDecideFinalizeReviewItemMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewResponse, ApiError, FinalizeReviewDecisionVariables> {
  return useReviewMutation(projectId, n, ({ itemId, body }: FinalizeReviewDecisionVariables) =>
    APIRequest.post(`${reviewPath(projectId, n)}/items/${itemId}/decision`)
      .body(body)
      .execute(),
  );
}

export function useKeepRoutineMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewResponse, ApiError, undefined> {
  return useReviewMutation(projectId, n, () =>
    APIRequest.post(`${reviewPath(projectId, n)}/keep-routine`)
      .body({})
      .execute(),
  );
}

// Finalize and revert rewrite the Story Bible, the plan, the chapter list and later drafts' stale marks, so every project read is refreshed.
export function useFinalizeReviewedChapterMutation(projectId: string, n: number): UseMutationResult<WorkflowRunResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, ApiError, undefined>({
    mutationFn: () =>
      APIRequest.post(`${reviewPath(projectId, n)}/finalize`)
        .body({})
        .execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: finalizeReviewKey(projectId, n) });
      queryClient.invalidateQueries({ queryKey: readinessKey(projectId, n) });
    },
  });
}

/** Only for a chapter approved before finalize reviews existed: the server finalizes it unreviewed when it has no review at all. */
export function useFinalizeUnreviewedChapterMutation(projectId: string, n: number): UseMutationResult<WorkflowRunResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<WorkflowRunResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/finalize`).body({ chapter: n }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
    onError: () => queryClient.invalidateQueries({ queryKey: readinessKey(projectId, n) }),
  });
}

export function useRevertFinalizeReviewMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<FinalizeReviewResponse, ApiError, undefined>({
    mutationFn: () =>
      APIRequest.post(`${reviewPath(projectId, n)}/revert`)
        .body({})
        .execute(),
    onSuccess: async review => {
      await storeReview(queryClient, projectId, n, review);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
    onError: error => refetchMovedReview(queryClient, projectId, n, error),
  });
}

export function useFinalizeReviewSettingsMutation(projectId: string, n: number): UseMutationResult<FinalizeReviewSettingsResponse, ApiError, FinalizeReviewCategory[]> {
  const queryClient = useQueryClient();
  return useMutation<FinalizeReviewSettingsResponse, ApiError, FinalizeReviewCategory[]>({
    mutationFn: autoKeep => APIRequest.put(`/projects/${projectId}/finalize-review/settings`).body({ autoKeep }).execute(),
    onSuccess: settings => {
      queryClient.setQueryData<FinalizeReviewResponse>(finalizeReviewKey(projectId, n), review => review && { ...review, autoKeep: settings.autoKeep });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId], exact: true });
    },
  });
}
