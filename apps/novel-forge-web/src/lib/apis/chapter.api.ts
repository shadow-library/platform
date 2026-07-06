/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type ChapterResponse, type ListChapterResponse, type ListChaptersQueryParams } from './api-types.gen';

/**
 * Source chapters are the ingested/scraped chapters of a project (distinct from
 * generated drafts). They back the Chapters list screen.
 */
const chapterKeys = {
  all: (projectId: string) => ['projects', projectId, 'chapters'] as const,
  list: (projectId: string, params?: ListChaptersQueryParams) => [...chapterKeys.all(projectId), 'list', params] as const,
  detail: (projectId: string, n: number) => [...chapterKeys.all(projectId), n] as const,
};

export function useListChaptersQuery(projectId: string, params?: ListChaptersQueryParams, enabled = true): UseQueryResult<ListChapterResponse, ApiError> {
  return useQuery<ListChapterResponse, ApiError>({
    queryKey: chapterKeys.list(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/source/chapters`)
        .query(params ?? {})
        .execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useChapterQuery(projectId: string, n: number, enabled = true): UseQueryResult<ChapterResponse, ApiError> {
  return useQuery<ChapterResponse, ApiError>({
    queryKey: chapterKeys.detail(projectId, n),
    queryFn: () => APIRequest.get(`/projects/${projectId}/source/chapters/${n}`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}
