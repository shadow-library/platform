import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type FactResponse, type ListFactsResponse, type RevealFactBody, type UpsertFactBody } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Canon facts, the spoiler ledger for a project. `GET /facts` already returns each fact's
 * `knowledge` entries, so "revealed" is derived client-side (`knowledge.length > 0`) rather than
 * needing a separate reveal-state field.
 */
const factKeys = {
  all: (projectId: string) => ['projects', projectId, 'facts'] as const,
  detail: (projectId: string, factKey: string) => [...factKeys.all(projectId), factKey] as const,
};

export const listFactsQueryOptions = (projectId: string): UseQueryOptions<ListFactsResponse, ApiError> =>
  queryOptions<ListFactsResponse, ApiError>({
    queryKey: factKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/facts`).execute(),
  });

export function useListFactsQuery(projectId: string, enabled = true): UseQueryResult<ListFactsResponse, ApiError> {
  return useQuery({ ...listFactsQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useFactQuery(projectId: string, factKey: string, enabled = true): UseQueryResult<FactResponse, ApiError> {
  return useQuery<FactResponse, ApiError>({
    queryKey: factKeys.detail(projectId, factKey),
    queryFn: () => APIRequest.get(`/projects/${projectId}/facts/${factKey}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(factKey),
  });
}

export type UpsertFactVariables = UpsertFactBody & { factKey: string };

// One PUT endpoint serves both create and update (arc-style merge), so the target key is part of the
// mutation's variables rather than fixed at hook-instantiation time — the create dialog only learns the
// key the user typed at submit time.
export function useUpsertFactMutation(projectId: string): UseMutationResult<FactResponse, ApiError, UpsertFactVariables> {
  const queryClient = useQueryClient();
  return useMutation<FactResponse, ApiError, UpsertFactVariables>({
    mutationFn: ({ factKey, ...data }) => APIRequest.put(`/projects/${projectId}/facts/${factKey}`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factKeys.all(projectId) }),
  });
}

export function useDeleteFactMutation(projectId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: factKey => APIRequest.delete(`/projects/${projectId}/facts/${factKey}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factKeys.all(projectId) }),
  });
}

export function useRevealFactMutation(projectId: string, factKey: string): UseMutationResult<FactResponse, ApiError, RevealFactBody> {
  const queryClient = useQueryClient();
  return useMutation<FactResponse, ApiError, RevealFactBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/facts/${factKey}/reveal`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factKeys.all(projectId) }),
  });
}

export function useRetractKnowledgeMutation(projectId: string, factKey: string): UseMutationResult<FactResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<FactResponse, ApiError, string>({
    mutationFn: entityKey => APIRequest.delete(`/projects/${projectId}/facts/${factKey}/knowledge/${entityKey}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factKeys.all(projectId) }),
  });
}
