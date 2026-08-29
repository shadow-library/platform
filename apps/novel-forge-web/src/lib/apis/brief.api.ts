import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type UpdateBriefBody } from './api-types.gen';
import { type BriefResponse, type ListBriefSummaryResponse } from './interstitial.api';
import { ApiError, APIRequest } from './transport';

const briefKeys = {
  list: (projectId: string) => ['projects', projectId, 'briefs', 'list'] as const,
  detail: (projectId: string, n: number) => ['projects', projectId, 'briefs', n] as const,
};

export const listBriefsQueryOptions = (projectId: string): UseQueryOptions<ListBriefSummaryResponse, ApiError> =>
  queryOptions<ListBriefSummaryResponse, ApiError>({
    queryKey: briefKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/briefs`).execute(),
  });

export function useListBriefsQuery(projectId: string, enabled = true): UseQueryResult<ListBriefSummaryResponse, ApiError> {
  return useQuery({ ...listBriefsQueryOptions(projectId), enabled: enabled && Boolean(projectId) });
}

export function useBriefQuery(projectId: string, n: number | undefined, enabled = true): UseQueryResult<BriefResponse, ApiError> {
  return useQuery<BriefResponse, ApiError>({
    queryKey: briefKeys.detail(projectId, n ?? -1),
    queryFn: () => APIRequest.get(`/projects/${projectId}/briefs/${n}`).execute(),
    enabled: enabled && Boolean(projectId) && n !== undefined,
  });
}

export function useUpdateBriefMutation(projectId: string, n: number): UseMutationResult<BriefResponse, ApiError, UpdateBriefBody> {
  const queryClient = useQueryClient();
  return useMutation<BriefResponse, ApiError, UpdateBriefBody>({
    mutationFn: data => APIRequest.put(`/projects/${projectId}/briefs/${n}`).body(data).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: briefKeys.detail(projectId, n) });
      queryClient.invalidateQueries({ queryKey: briefKeys.list(projectId) });
    },
  });
}
