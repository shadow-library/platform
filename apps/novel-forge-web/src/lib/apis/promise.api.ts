import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type ListPromisesQueryParams, type ListPromisesResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

const promiseKeys = {
  all: (projectId: string) => ['projects', projectId, 'promises'] as const,
  list: (projectId: string, params: ListPromisesQueryParams) => [...promiseKeys.all(projectId), 'list', params] as const,
};

export function useListPromisesQuery(projectId: string, params: ListPromisesQueryParams, enabled = true): UseQueryResult<ListPromisesResponse, ApiError> {
  return useQuery<ListPromisesResponse, ApiError>({
    queryKey: promiseKeys.list(projectId, params),
    queryFn: () => APIRequest.get(`/projects/${projectId}/promises`).query(params).execute(),
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(projectId),
  });
}
