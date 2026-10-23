import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type AdminContextResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export type { AdminContextResponse };

const adminContextKeys = {
  all: ['admin', 'context'] as const,
};

/** Session-only and never 403 (a non-admin gets an empty list); the identity server still enforces every privileged endpoint. */
const adminContextQueryOptions = (enabled = true) =>
  queryOptions<AdminContextResponse, ApiError>({
    queryKey: adminContextKeys.all,
    queryFn: ({ signal }) => APIRequest.get('/admin/context').signal(signal).execute<AdminContextResponse>(),
    retry: false,
    enabled,
  });

export function useAdminContextQuery(enabled = true): UseQueryResult<AdminContextResponse, ApiError> {
  return useQuery(adminContextQueryOptions(enabled));
}
