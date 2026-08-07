import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type MyApplicationItem, type MyApplicationsResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type MyApplication = MyApplicationItem;
export type { MyApplicationsResponse };

export const myApplicationKeys = {
  all: ['me', 'applications'] as const,
};

export const myApplicationsQueryOptions = () =>
  queryOptions<MyApplicationsResponse, ApiError>({
    queryKey: myApplicationKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/me/applications').signal(signal).execute<MyApplicationsResponse>(),
  });

export function useMyApplicationsQuery(): UseQueryResult<MyApplicationsResponse, ApiError> {
  return useQuery(myApplicationsQueryOptions());
}
