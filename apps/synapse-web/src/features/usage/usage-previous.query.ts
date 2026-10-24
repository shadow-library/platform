import { queryOptions, skipToken, type UseQueryOptions } from '@tanstack/react-query';

import { type ApiError, APIRequest, type GetUsageQueryParams, usageKeys, type UsageResponse } from '@/lib';

/** Its own key, so the previous period can never be served the current period's cached report. */
export function previousUsageQueryOptions(params: GetUsageQueryParams | null): UseQueryOptions<UsageResponse, ApiError> {
  return queryOptions<UsageResponse, ApiError>({
    queryKey: [...usageKeys.all, 'previous', params],
    queryFn: params
      ? ({ signal }) =>
          APIRequest.get('/admin/usage')
            .query({ ...params })
            .signal(signal)
            .execute()
      : skipToken,
  });
}
