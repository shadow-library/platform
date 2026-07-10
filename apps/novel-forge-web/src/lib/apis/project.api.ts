/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useListProjectsQuery(params?: ListProjectsQueryParams): UseQueryResult<ListProjectResponse, ApiError> {
  return useQuery<ListProjectResponse, ApiError>({
    queryKey: projectKeys.list(params),
    queryFn: () =>
      APIRequest.get('/projects')
        .query(params ?? {})
        .execute(),
  });
}

export function useProjectQuery(projectId: string, enabled = true): UseQueryResult<ProjectResponse, ApiError> {
  return useQuery<ProjectResponse, ApiError>({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useProjectStatusQuery(projectId: string, enabled = true): UseQueryResult<ProjectStatusResponse, ApiError> {
  return useQuery<ProjectStatusResponse, ApiError>({
    queryKey: projectKeys.status(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/status`).execute(),
    enabled: enabled && Boolean(projectId),
  });
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
