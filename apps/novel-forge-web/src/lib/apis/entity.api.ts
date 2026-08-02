/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import {
  type AddEntityImageBody,
  type CreateEntityBody,
  type EntityResponse,
  type ListEntitiesQueryParams,
  type ListEntityResponse,
  type UpdateEntityBody,
  type UploadImageBody,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Defining types
 */

// The gallery of additional reference images an entity carries, alongside its single `imagePath`
// portrait. Hand-authored until the generated OpenAPI types pick up the new fields on redeploy.
export interface EntityImage {
  id: string;
  imagePath: string;
  caption?: string | null;
  sortOrder: number;
}

export type EntityWithImages = EntityResponse & { images?: EntityImage[] };

/**
 * Declaring the constants
 */
const entityKeys = {
  all: (projectId: string) => ['projects', projectId, 'entities'] as const,
  list: (projectId: string, params?: ListEntitiesQueryParams) => [...entityKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, entityKey: string) => [...entityKeys.all(projectId), entityKey] as const,
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

export function useEntityQuery(projectId: string, entityKey: string, enabled = true): UseQueryResult<EntityWithImages, ApiError> {
  return useQuery<EntityWithImages, ApiError>({
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

/** Appends a reference image to the entity's gallery (distinct from the single portrait `imagePath`). */
export function useAddEntityImageMutation(projectId: string, entityKey: string): UseMutationResult<EntityWithImages, ApiError, AddEntityImageBody> {
  const queryClient = useQueryClient();
  return useMutation<EntityWithImages, ApiError, AddEntityImageBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/entities/${entityKey}/images`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}

/** Removes a single gallery image by its id. */
export function useDeleteEntityImageByIdMutation(projectId: string, entityKey: string): UseMutationResult<EntityWithImages, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<EntityWithImages, ApiError, string>({
    mutationFn: imageId => APIRequest.delete(`/projects/${projectId}/entities/${entityKey}/images/${imageId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all(projectId) }),
  });
}
