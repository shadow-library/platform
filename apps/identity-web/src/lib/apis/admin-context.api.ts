/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import { type AdminContextResponse } from './api-types.gen';
import { serverFetch } from './server-fetch';

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

const fetchAdminContext = createServerFn({ method: 'GET' }).handler(() => serverFetch<AdminContextResponse>({ method: 'GET', path: '/admin/context' }));

/**
 * The caller's granted platform-admin permissions. Session-only and never 403 — a non-admin gets an
 * empty list — so first-party surfaces can reveal the operator console to staff only, without the
 * client making authorization decisions: the identity server still enforces every privileged endpoint.
 */
export const adminContextQueryOptions = (enabled = true) =>
  queryOptions<AdminContextResponse, ApiError>({
    queryKey: adminContextKeys.all,
    queryFn: () => call(fetchAdminContext()),
    retry: false,
    enabled,
  });

export function useAdminContextQuery(enabled = true): UseQueryResult<AdminContextResponse, ApiError> {
  return useQuery(adminContextQueryOptions(enabled));
}
