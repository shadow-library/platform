import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type IllustrationResponse,
  type ListIllustrationsQueryParams,
  type ListIllustrationsResponse,
  type RefineIllustrationBody,
  type SaveIllustrationBody,
  type SelectIllustrationBody,
  type StartIllustrationBody,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const illustrationKeys = {
  all: (projectId: string) => ['projects', projectId, 'illustrations'] as const,
  list: (projectId: string, params?: ListIllustrationsQueryParams) => [...illustrationKeys.all(projectId), 'list', params] as const,
};

export const listIllustrationsQueryOptions = (projectId: string, params?: ListIllustrationsQueryParams): UseQueryOptions<ListIllustrationsResponse, ApiError> =>
  queryOptions<ListIllustrationsResponse, ApiError>({
    queryKey: illustrationKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/illustrations`)
        .query(params ?? {})
        .execute(),
  });

export function useListIllustrationsQuery(projectId: string, params?: ListIllustrationsQueryParams, enabled = true): UseQueryResult<ListIllustrationsResponse, ApiError> {
  return useQuery({ ...listIllustrationsQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useStartIllustrationMutation(projectId: string): UseMutationResult<IllustrationResponse, ApiError, StartIllustrationBody> {
  const queryClient = useQueryClient();
  return useMutation<IllustrationResponse, ApiError, StartIllustrationBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/illustrations`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) }),
  });
}

export function useRefineIllustrationMutation(projectId: string, illustrationId: string): UseMutationResult<IllustrationResponse, ApiError, RefineIllustrationBody> {
  const queryClient = useQueryClient();
  return useMutation<IllustrationResponse, ApiError, RefineIllustrationBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/illustrations/${illustrationId}/refine`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) }),
  });
}

export function useSelectIllustrationMutation(projectId: string, illustrationId: string): UseMutationResult<IllustrationResponse, ApiError, SelectIllustrationBody> {
  const queryClient = useQueryClient();
  return useMutation<IllustrationResponse, ApiError, SelectIllustrationBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/illustrations/${illustrationId}/select`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) }),
  });
}

/** Saving writes the selected candidate onto the entity, chapter or project it was composed for, so the whole project subtree is refetched. */
export function useSaveIllustrationMutation(projectId: string, illustrationId: string): UseMutationResult<IllustrationResponse, ApiError, SaveIllustrationBody> {
  const queryClient = useQueryClient();
  return useMutation<IllustrationResponse, ApiError, SaveIllustrationBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/illustrations/${illustrationId}/save`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

export function useDiscardIllustrationMutation(projectId: string, illustrationId: string): UseMutationResult<IllustrationResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<IllustrationResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/illustrations/${illustrationId}/discard`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: illustrationKeys.all(projectId) }),
  });
}
