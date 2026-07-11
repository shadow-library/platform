/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type CreateEntityBody, type EntityResponse, type ListEntitiesQueryParams, type ListEntityResponse, type UpdateEntityBody, type UploadImageBody } from './api-types.gen';

/**
 * Declaring the constants
 */
const entityKeys = {
  all: (projectId: string) => ['projects', projectId, 'entities'] as const,
  list: (projectId: string, params?: ListEntitiesQueryParams) => [...entityKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, entityKey: string) => [...entityKeys.all(projectId), entityKey] as const,
};

export function useListEntitiesQuery(projectId: string, params?: ListEntitiesQueryParams, enabled = true): UseQueryResult<ListEntityResponse, ApiError> {
  return useQuery<ListEntityResponse, ApiError>({
    queryKey: entityKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/entities`)
        .query(params ?? {})
        .execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useEntityQuery(projectId: string, entityKey: string, enabled = true): UseQueryResult<EntityResponse, ApiError> {
  return useQuery<EntityResponse, ApiError>({
    queryKey: entityKeys.detail(projectId, entityKey),
    queryFn: () => APIRequest.get(`/projects/${projectId}/entities/${entityKey}`).execute(),
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
