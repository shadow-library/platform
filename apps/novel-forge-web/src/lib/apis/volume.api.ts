/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type ListVolumeResponse, type ListVolumesQueryParams, type VolumeResponse } from './api-types.gen';

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
