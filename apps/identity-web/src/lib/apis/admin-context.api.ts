/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ApiError, APIRequest } from './api-request';
import { type AdminContextResponse } from './api-types.gen';

/**
 * Defining types
 */
export type { AdminContextResponse };

/**
 * Declaring the constants
 */
export const adminContextKeys = {
  all: ['admin', 'context'] as const,
};

/**
 * The caller's granted platform-admin permissions. Session-only and never 403 — a non-admin gets an
 * empty list — so first-party surfaces can reveal the operator console to staff only, without the
 * client making authorization decisions: the identity server still enforces every privileged endpoint.
 */
export const adminContextQueryOptions = (enabled = true) =>
  queryOptions<AdminContextResponse, ApiError>({
    queryKey: adminContextKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/context').signal(signal).execute<AdminContextResponse>(),
    retry: false,
    enabled,
  });

export function useAdminContextQuery(enabled = true): UseQueryResult<AdminContextResponse, ApiError> {
  return useQuery(adminContextQueryOptions(enabled));
}
