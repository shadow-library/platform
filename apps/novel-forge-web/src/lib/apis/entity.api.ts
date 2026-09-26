import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type AddEntityImageBody,
  type CreateEntityBody,
  type DateEntityImageBody,
  type EntityResponse,
  type ListEntitiesQueryParams,
  type ListEntityResponse,
  type TimelineResponse,
  type UpdateEntityBody,
  type UploadImageBody,
} from './api-types.gen';
import { illustrationKeys } from './illustration.api';
import { ApiError, APIRequest } from './transport';

const entityKeys = {
  all: (projectId: string) => ['projects', projectId, 'entities'] as const,
  list: (projectId: string, params?: ListEntitiesQueryParams) => [...entityKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, entityKey: string) => [...entityKeys.all(projectId), entityKey] as const,
  timeline: (projectId: string, entityKey: string) => [...entityKeys.all(projectId), entityKey, 'timeline'] as const,
};

export const listEntitiesQueryOptions = (projectId: string, params?: ListEntitiesQueryParams): UseQueryOptions<ListEntityResponse, ApiError> =>
  queryOptions<ListEntityResponse, ApiError>({
    queryKey: entityKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/entities`)
        .query(params ?? {})
        .execute(),
  });

export function useListEntitiesQuery(projectId: string, params?: ListEntitiesQueryParams, enabled = true): UseQueryResult<ListEntityResponse, ApiError> {
  return useQuery({ ...listEntitiesQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useEntityQuery(projectId: string, entityKey: string, enabled = true): UseQueryResult<EntityResponse, ApiError> {
  return useQuery<EntityResponse, ApiError>({
    queryKey: entityKeys.detail(projectId, entityKey),
    queryFn: () => APIRequest.get(`/projects/${projectId}/entities/${entityKey}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(entityKey),
  });
}

export function useEntityTimelineQuery(projectId: string, entityKey: string, enabled = true): UseQueryResult<TimelineResponse, ApiError> {
  return useQuery<TimelineResponse, ApiError>({
    queryKey: entityKeys.timeline(projectId, entityKey),
    queryFn: () => APIRequest.get(`/projects/${projectId}/entities/${entityKey}/timeline`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(entityKey),
  });
}

export function useCreateEntityMutation(projectId: string): UseMutationResult<EntityResponse, ApiError, CreateEntityBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, CreateEntityBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/entities`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useUpdateEntityMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, UpdateEntityBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, UpdateEntityBody>({
    mutationFn: data => APIRequest.patch(`/projects/${projectId}/entities/${entityKey}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useDeleteEntityMutation(projectId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: entityKey => APIRequest.delete(`/projects/${projectId}/entities/${entityKey}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useUploadEntityImageMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, UploadImageBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, UploadImageBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/entities/${entityKey}/image`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useDeleteEntityImageMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.delete(`/projects/${projectId}/entities/${entityKey}/image`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

/** Re-dates the portrait; allows a future chapter, unlike generating or dating a gallery image against it. */
export function useDatePortraitMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, DateEntityImageBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, DateEntityImageBody>({
    mutationFn: data => APIRequest.patch(`/projects/${projectId}/entities/${entityKey}/image`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) });
    },
  });
}

export function useAddEntityImageMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, AddEntityImageBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, AddEntityImageBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/entities/${entityKey}/images`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useDeleteEntityImageByIdMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, string>({
    mutationFn: imageId => APIRequest.delete(`/projects/${projectId}/entities/${entityKey}/images/${imageId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

export function useDateEntityImageMutation(projectId: string, entityKey: string): UseMutationResult<EntityResponse, ApiError, { imageId: string } & DateEntityImageBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityResponse, ApiError, { imageId: string } & DateEntityImageBody>({
    mutationFn: ({ imageId, ...data }) => APIRequest.patch(`/projects/${projectId}/entities/${entityKey}/images/${imageId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) });
    },
  });
}
