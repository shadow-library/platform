/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type MyApplicationItem, type MyApplicationsResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

/**
 * Defining types
 */

/** An application the signed-in user uses; membership is provisioned on first consent. */
export type MyApplication = MyApplicationItem;
export type { MyApplicationsResponse };

/**
 * Declaring the constants
 */
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
