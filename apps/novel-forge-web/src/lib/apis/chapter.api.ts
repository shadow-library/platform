/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest } from './api-request';
import { type ChapterResponse, type ListChapterResponse, type ListChaptersQueryParams } from './api-types.gen';

/**
 * Source chapters are a project's chapters supplied via a novel-import bundle (distinct from
 * generated drafts). They back the Chapters list screen.
 */
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

export function useChapterQuery(projectId: string, n: number, enabled = true): UseQueryResult<ChapterResponse, ApiError> {
  return useQuery<ChapterResponse, ApiError>({
    queryKey: chapterKeys.detail(projectId, n),
    queryFn: () => APIRequest.get(`/projects/${projectId}/source/chapters/${n}`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}
