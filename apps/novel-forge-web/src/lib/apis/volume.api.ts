import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type ListVolumeResponse, type VolumeAdvanceResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const VOLUME_LIST_LIMIT = 100;

const volumeKeys = {
  all: (projectId: string) => ['projects', projectId, 'volumes'] as const,
  list: (projectId: string) => [...volumeKeys.all(projectId), 'list'] as const,
};

export const listVolumesQueryOptions = (projectId: string): UseQueryOptions<ListVolumeResponse, ApiError> =>
  queryOptions<ListVolumeResponse, ApiError>({
    queryKey: volumeKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/volumes`).query({ limit: VOLUME_LIST_LIMIT }).execute(),
  });

export function useListVolumesQuery(projectId: string, enabled = true): UseQueryResult<ListVolumeResponse, ApiError> {
  return useQuery({ ...listVolumesQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useVolumeGoalMetMutation(projectId: string): UseMutationResult<VolumeAdvanceResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<VolumeAdvanceResponse, ApiError, string>({
    mutationFn: volumeKey =>
      APIRequest.post(`/projects/${projectId}/volumes/${encodeURIComponent(volumeKey)}/goal-met`)
        .body({})
        .execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: volumeKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'status'] });
    },
  });
}
