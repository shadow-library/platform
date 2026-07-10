/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import {
  type ApproveArcsResponse,
  type ApprovePlanResponse,
  type ListArcResponse,
  type ListVolumeResponse,
  type ListVolumesQueryParams,
  type OutlineArcBody,
  type OutlineResponse,
  type PlanArcsBody,
  type PlanArcsResponse,
  type VolumeResponse,
} from './api-types.gen';

/**
 * Declaring the constants
 */
const volumeKeys = {
  all: (projectId: string) => ['projects', projectId, 'volumes'] as const,
  list: (projectId: string, params?: ListVolumesQueryParams) => [...volumeKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, volumeKey: string) => [...volumeKeys.all(projectId), volumeKey] as const,
};

export function useListVolumesQuery(projectId: string, params?: ListVolumesQueryParams, enabled = true): UseQueryResult<ListVolumeResponse, ApiError> {
  return useQuery<ListVolumeResponse, ApiError>({
    queryKey: volumeKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/volumes`)
        .query(params ?? {})
        .execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useVolumeQuery(projectId: string, volumeKey: string, enabled = true): UseQueryResult<VolumeResponse, ApiError> {
  return useQuery<VolumeResponse, ApiError>({
    queryKey: volumeKeys.detail(projectId, volumeKey),
    queryFn: () => APIRequest.get(`/projects/${projectId}/volumes/${volumeKey}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(volumeKey),
  });
}

export function useListArcsQuery(projectId: string, volumeKey: string | undefined, enabled = true): UseQueryResult<ListArcResponse, ApiError> {
  return useQuery<ListArcResponse, ApiError>({
    queryKey: [...volumeKeys.detail(projectId, volumeKey ?? ''), 'arcs'],
    queryFn: () => APIRequest.get(`/projects/${projectId}/volumes/${volumeKey}/arcs`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(volumeKey),
  });
}

/** AI-plans the arcs of one volume. The result is a staged proposal — apply it from Proposals. */
export function usePlanArcsMutation(projectId: string, volumeKey: string): UseMutationResult<PlanArcsResponse, ApiError, PlanArcsBody> {
  const queryClient = useQueryClient();
  return useMutation<PlanArcsResponse, ApiError, PlanArcsBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/volumes/${volumeKey}/arcs/plan`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'refinement-proposals'] }),
  });
}

/** Approves every arc of a volume, unlocking brief generation for its chapters. */
export function useApproveArcsMutation(projectId: string, volumeKey: string): UseMutationResult<ApproveArcsResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<ApproveArcsResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/volumes/${volumeKey}/arcs/approve`).body({}).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: volumeKeys.all(projectId) }),
  });
}

/** Generates the chapter briefs for exactly one arc's span. */
export function useOutlineArcMutation(projectId: string, arcKey: string): UseMutationResult<OutlineResponse, ApiError, OutlineArcBody | undefined> {
  const queryClient = useQueryClient();
  return useMutation<OutlineResponse, ApiError, OutlineArcBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/arcs/${arcKey}/outline`)
        .body(body ?? {})
        .execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'briefs'] }),
  });
}

/** Approves the whole volume plan, locking the structure for drafting. */
export function useApproveVolumesMutation(projectId: string): UseMutationResult<ApprovePlanResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<ApprovePlanResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/volumes/approve`).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: volumeKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
    },
  });
}
