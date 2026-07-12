/**
 * Importing npm packages
 */
import { type UseQueryResult, useQuery } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
import { type MyApplicationItem, type MyApplicationsResponse } from './api-types.gen';

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

export function useMyApplicationsQuery(): UseQueryResult<MyApplicationsResponse, ApiError> {
  return useQuery<MyApplicationsResponse, ApiError>({
    queryKey: myApplicationKeys.all,
    queryFn: () => APIRequest.get('/me/applications').execute(),
  });
}
