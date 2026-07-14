/**
 * Importing npm packages
 */
import { type UseQueryResult, queryOptions, useQuery } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type MyApplicationItem, type MyApplicationsResponse } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

const fetchMyApplications = createServerFn({ method: 'GET' }).handler(() => serverFetch<MyApplicationsResponse>({ method: 'GET', path: '/me/applications' }));

export const myApplicationsQueryOptions = () =>
  queryOptions<MyApplicationsResponse, ApiError>({
    queryKey: myApplicationKeys.all,
    queryFn: () => call(fetchMyApplications()),
  });

export function useMyApplicationsQuery(): UseQueryResult<MyApplicationsResponse, ApiError> {
  return useQuery(myApplicationsQueryOptions());
}
