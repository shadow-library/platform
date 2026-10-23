import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type BriefResponse, type ListBriefSummaryResponse } from './api-types.gen';
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
