import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type ChapterSearchResponse, type SearchChaptersQueryParams } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const chapterKeys = {
  all: (projectId: string) => ['projects', projectId, 'chapters'] as const,
};

export function useSearchChaptersQuery(projectId: string, params: SearchChaptersQueryParams, enabled = true): UseQueryResult<ChapterSearchResponse, ApiError> {
  return useQuery<ChapterSearchResponse, ApiError>({
    queryKey: [...chapterKeys.all(projectId), 'search', params],
    queryFn: () => APIRequest.get(`/projects/${projectId}/source/chapters/search`).query(params).execute(),
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(projectId) && params.q.trim() !== '',
  });
}
