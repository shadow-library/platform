import { keepPreviousData, queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import { type ChapterResponse, type ChapterSearchResponse, type ListChapterResponse, type ListChaptersQueryParams, type SearchChaptersQueryParams } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const chapterKeys = {
  all: (projectId: string) => ['projects', projectId, 'chapters'] as const,
  list: (projectId: string, params?: ListChaptersQueryParams) => [...chapterKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, n: number) => [...chapterKeys.all(projectId), n] as const,
};

export const listChaptersQueryOptions = (projectId: string, params?: ListChaptersQueryParams): UseQueryOptions<ListChapterResponse, ApiError> =>
  queryOptions<ListChapterResponse, ApiError>({
    queryKey: chapterKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/source/chapters`)
        .query(params ?? {})
        .execute(),
  });

export function useListChaptersQuery(projectId: string, params?: ListChaptersQueryParams, enabled = true): UseQueryResult<ListChapterResponse, ApiError> {
  return useQuery({ ...listChaptersQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useSearchChaptersQuery(projectId: string, params: SearchChaptersQueryParams, enabled = true): UseQueryResult<ChapterSearchResponse, ApiError> {
  return useQuery<ChapterSearchResponse, ApiError>({
    queryKey: [...chapterKeys.all(projectId), 'search', params],
    queryFn: () => APIRequest.get(`/projects/${projectId}/source/chapters/search`).query(params).execute(),
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(projectId) && params.q.trim() !== '',
  });
}

export function useChapterQuery(projectId: string, n: number, enabled = true): UseQueryResult<ChapterResponse, ApiError> {
  return useQuery<ChapterResponse, ApiError>({
    queryKey: chapterKeys.detail(projectId, n),
    queryFn: () => APIRequest.get(`/projects/${projectId}/source/chapters/${n}`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}
