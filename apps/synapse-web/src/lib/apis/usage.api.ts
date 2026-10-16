import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type GetUsageQueryParams, type UsageResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export const usageQueryOptions = (params: GetUsageQueryParams = {}): UseQueryOptions<UsageResponse, ApiError> =>
  queryOptions<UsageResponse, ApiError>({
    queryKey: ['usage', params],
    queryFn: ({ signal }) =>
      APIRequest.get('/admin/usage')
        .query({ ...params })
        .signal(signal)
        .execute(),
  });
