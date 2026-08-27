import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type CreateSeedBody,
  type GraduateSeedBody,
  type GraduationResponse,
  type ListSeedsQueryParams,
  type ListSeedsResponse,
  type SeedResponse,
  type SeedStressResponse,
} from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * The Ideation Studio surface: a seed is a project in `seed` status carrying one story-seed sheet, so its
 * id is the project id everywhere below and deletion rides the ordinary project cascade. The conversation
 * itself is an ordinary chat session — `refinement.api.ts` drives it; only the sheet, the stress pass and
 * graduation are the studio's own.
 */
const seedKeys = {
  all: ['seeds'] as const,
  list: (params?: ListSeedsQueryParams) => [...seedKeys.all, 'list', params] as const,
  sheet: (projectId: string) => ['projects', projectId, 'seed'] as const,
};

export const listSeedsQueryOptions = (params?: ListSeedsQueryParams): UseQueryOptions<ListSeedsResponse, ApiError> =>
  queryOptions<ListSeedsResponse, ApiError>({
    queryKey: seedKeys.list(params),
    queryFn: () =>
      APIRequest.get('/seeds')
        .query(params ?? {})
        .execute(),
  });

export const seedQueryOptions = (projectId: string): UseQueryOptions<SeedResponse, ApiError> =>
  queryOptions<SeedResponse, ApiError>({
    queryKey: seedKeys.sheet(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/seed`).execute(),
  });

export function useListSeedsQuery(params?: ListSeedsQueryParams): UseQueryResult<ListSeedsResponse, ApiError> {
  return useQuery(listSeedsQueryOptions(params));
}

export function useSeedQuery(projectId: string, enabled = true): UseQueryResult<SeedResponse, ApiError> {
  return useQuery({ ...seedQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useCreateSeedMutation(): UseMutationResult<SeedResponse, ApiError, CreateSeedBody> {
  const queryClient = useQueryClient();
  return useMutation<SeedResponse, ApiError, CreateSeedBody>({
    mutationFn: body => APIRequest.post('/seeds').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: seedKeys.all }),
  });
}

export function useStressSeedMutation(projectId: string): UseMutationResult<SeedStressResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<SeedStressResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/seed/stress`).execute(),
    onSuccess: result => queryClient.setQueryData(seedKeys.sheet(projectId), result.seed),
  });
}

/**
 * The canonical graduation path — the studio's own button rather than the `action.graduate_seed` op, which
 * is never auto-applied. It ends the seed: the sheet row is deleted and the project joins the main shelf.
 */
export function useGraduateSeedMutation(projectId: string): UseMutationResult<GraduationResponse, ApiError, GraduateSeedBody> {
  const queryClient = useQueryClient();
  return useMutation<GraduationResponse, ApiError, GraduateSeedBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/seed/graduate`).body(body).execute(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: seedKeys.sheet(projectId) });
      queryClient.invalidateQueries({ queryKey: seedKeys.all });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteSeedMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: projectId => APIRequest.delete(`/projects/${projectId}`).execute(),
    onSuccess: (_result, projectId) => {
      queryClient.removeQueries({ queryKey: seedKeys.sheet(projectId) });
      queryClient.invalidateQueries({ queryKey: seedKeys.all });
    },
  });
}

/**
 * A studio turn answers with the sheet as it left it, so the pane on the right refreshes from the turn
 * itself; the refetch behind it still runs, because an auto-applied turn also moves the proposal and
 * change history the sheet's revert affordance reads.
 */
export function useSeedSync(projectId: string): (seed?: SeedResponse) => void {
  const queryClient = useQueryClient();
  return seed => {
    if (seed) queryClient.setQueryData(seedKeys.sheet(projectId), seed);
    queryClient.invalidateQueries({ queryKey: seedKeys.sheet(projectId) });
  };
}
