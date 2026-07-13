/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryOptions, type UseQueryResult, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import {
  type CloneProjectBody,
  type CreateProjectBody,
  type ListProjectResponse,
  type ListProjectsQueryParams,
  type ProjectResponse,
  type ProjectStatusResponse,
  type ResetBody,
  type ResetResponse,
  type UpdateProjectBody,
  type UploadImageBody,
} from './api-types.gen';

/**
 * Declaring the constants
 */
const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (params?: ListProjectsQueryParams) => [...projectKeys.lists(), params] as const,
  detail: (projectId: string) => [...projectKeys.all, projectId] as const,
  status: (projectId: string) => [...projectKeys.all, projectId, 'status'] as const,
};

/**
 * Query-option factories shared by route loaders and component hooks. A loader prefetches these via
 * `context.queryClient.ensureQueryData(...)` and the matching hook reads the same cache entry — identical
 * key + fn — so the SSR-dehydrated data hydrates without a second request.
 */
export const listProjectsQueryOptions = (params?: ListProjectsQueryParams): UseQueryOptions<ListProjectResponse, ApiError> =>
  queryOptions<ListProjectResponse, ApiError>({
    queryKey: projectKeys.list(params),
    queryFn: () =>
      APIRequest.get('/projects')
        .query(params ?? {})
        .execute(),
  });

export const projectQueryOptions = (projectId: string): UseQueryOptions<ProjectResponse, ApiError> =>
  queryOptions<ProjectResponse, ApiError>({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}`).execute(),
  });

export const projectStatusQueryOptions = (projectId: string): UseQueryOptions<ProjectStatusResponse, ApiError> =>
  queryOptions<ProjectStatusResponse, ApiError>({
    queryKey: projectKeys.status(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/status`).execute(),
  });

export function useListProjectsQuery(params?: ListProjectsQueryParams): UseQueryResult<ListProjectResponse, ApiError> {
  return useQuery(listProjectsQueryOptions(params));
}

export function useProjectQuery(projectId: string, enabled = true): UseQueryResult<ProjectResponse, ApiError> {
  return useQuery({ ...projectQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useProjectStatusQuery(projectId: string, enabled = true): UseQueryResult<ProjectStatusResponse, ApiError> {
  return useQuery({ ...projectStatusQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useCreateProjectMutation(): UseMutationResult<ProjectResponse, ApiError, CreateProjectBody> {
  const queryClient = useQueryClient();
  return useMutation<ProjectResponse, ApiError, CreateProjectBody>({
    mutationFn: data => APIRequest.post('/projects').body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

export function useUpdateProjectMutation(projectId: string): UseMutationResult<ProjectResponse, ApiError, UpdateProjectBody> {
  const queryClient = useQueryClient();
  return useMutation<ProjectResponse, ApiError, UpdateProjectBody>({
    mutationFn: data => APIRequest.patch(`/projects/${projectId}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useUploadCoverMutation(projectId: string): UseMutationResult<ProjectResponse, ApiError, UploadImageBody> {
  const queryClient = useQueryClient();
  return useMutation<ProjectResponse, ApiError, UploadImageBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/cover`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useDeleteCoverMutation(projectId: string): UseMutationResult<ProjectResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<ProjectResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.delete(`/projects/${projectId}/cover`).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

export function useDeleteProjectMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: projectId => APIRequest.delete(`/projects/${projectId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

/** Clones a project into a fresh copy, optionally resetting derived artefacts. */
export function useCloneProjectMutation(projectId: string): UseMutationResult<ProjectResponse, ApiError, CloneProjectBody> {
  const queryClient = useQueryClient();
  return useMutation<ProjectResponse, ApiError, CloneProjectBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/clone`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  });
}

/** Resets a project's derived state up to a lifecycle stage (extract / plan / generate / all). */
export function useResetProjectMutation(projectId: string): UseMutationResult<ResetResponse, ApiError, ResetBody> {
  const queryClient = useQueryClient();
  return useMutation<ResetResponse, ApiError, ResetBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/reset`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
