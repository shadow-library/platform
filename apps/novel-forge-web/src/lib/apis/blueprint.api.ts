import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type BlueprintRoundResponse,
  type BlueprintStateResponse,
  type CancelBlueprintRoundResponse,
  type LockBlueprintStepBody,
  type LockBlueprintStepResponse,
  type PremisePreviewBody,
  type PremisePreviewResponse,
  type StartBlueprintRoundBody,
  type TitleChecksBody,
  type TitleChecksListResponse,
} from './api-types.gen';
import { invalidateSoon } from './batched-invalidation';
import { invalidateLedger } from './ledger.api';
import { livePolling } from './live-polling';
import { invalidateProjectStatus } from './project.api';
import { ApiError, APIRequest } from './transport';

/**
 * The Blueprint step engine. One cache entry holds every step's state, because a sourced screen's latest
 * round is its pass's round narrowed to that screen — reading them apart would show two spinners for one
 * generation.
 */
const blueprintKeys = {
  state: (projectId: string) => ['projects', projectId, 'blueprint'] as const,
};

const LIVE_ROUND_POLL_MS = 2_500;

/** A round whose job has not settled yet. Lives here, beside the response type, so the UI and the poll cannot disagree on it. */
export function isRoundLive(round: BlueprintRoundResponse | null): boolean {
  return round?.status === 'pending' || round?.status === 'running';
}

const hasLiveRound = (data?: BlueprintStateResponse): boolean => data?.steps.some(step => isRoundLive(step.latestRound)) ?? false;

export const blueprintStateQueryOptions = (projectId: string): UseQueryOptions<BlueprintStateResponse, ApiError> =>
  queryOptions<BlueprintStateResponse, ApiError>({
    queryKey: blueprintKeys.state(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/blueprint`).execute(),
    // The same safety net every job-backed query has: the event stream normally settles a round, and this
    // only covers an event the stream dropped.
    refetchInterval: livePolling(projectId, query => (hasLiveRound(query.state.data) ? LIVE_ROUND_POLL_MS : false)),
  });

export function useBlueprintStateQuery(projectId: string, enabled = true): UseQueryResult<BlueprintStateResponse, ApiError> {
  return useQuery({ ...blueprintStateQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useStartBlueprintRoundMutation(projectId: string, stepKey: string): UseMutationResult<BlueprintRoundResponse, ApiError, StartBlueprintRoundBody> {
  const queryClient = useQueryClient();
  return useMutation<BlueprintRoundResponse, ApiError, StartBlueprintRoundBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/blueprint/steps/${stepKey}/rounds`).body(body).execute(),
    // A kept steer lands as a direction entry the moment the round opens, so the Notebook refetches with it.
    onSuccess: () => {
      invalidateBlueprint(queryClient, projectId);
      invalidateLedger(queryClient, projectId);
    },
  });
}

export function useCancelBlueprintRoundMutation(projectId: string, stepKey: string): UseMutationResult<CancelBlueprintRoundResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<CancelBlueprintRoundResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/blueprint/steps/${stepKey}/rounds/cancel`).execute(),
    onSuccess: () => invalidateBlueprint(queryClient, projectId),
  });
}

export function useLockBlueprintStepMutation(projectId: string, stepKey: string): UseMutationResult<LockBlueprintStepResponse, ApiError, LockBlueprintStepBody> {
  const queryClient = useQueryClient();
  return useMutation<LockBlueprintStepResponse, ApiError, LockBlueprintStepBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/blueprint/steps/${stepKey}/lock`).body(body).execute(),
    onSuccess: () => invalidateBlueprintProgress(queryClient, projectId),
  });
}

/** The throwaway opening paragraph: one model call, nothing saved, so nothing is invalidated when it returns. */
export function usePremisePreviewMutation(projectId: string): UseMutationResult<PremisePreviewResponse, ApiError, PremisePreviewBody> {
  return useMutation<PremisePreviewResponse, ApiError, PremisePreviewBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/blueprint/premise/preview`).body(body).execute(),
  });
}

/** The title checks: the author's own library and the shape of a catalog card. No model call, so nothing is invalidated. */
export function useTitleChecksMutation(projectId: string): UseMutationResult<TitleChecksListResponse, ApiError, TitleChecksBody> {
  return useMutation<TitleChecksListResponse, ApiError, TitleChecksBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/blueprint/title/checks`).body(body).execute(),
  });
}

export function invalidateBlueprint(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: blueprintKeys.state(projectId) });
}

/** Everything a finished round or a lock can have moved: the step's options, the Notebook, and the phase the status derives from. */
export function invalidateBlueprintProgress(queryClient: QueryClient, projectId: string): void {
  invalidateBlueprint(queryClient, projectId);
  invalidateLedger(queryClient, projectId);
  invalidateProjectStatus(queryClient, projectId);
}
