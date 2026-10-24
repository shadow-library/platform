import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type GetUsageQueryParams, type GetUsageSeriesQueryParams, type UsageResponse, type UsageSeriesResponse } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

export const usageKeys = {
  all: ['usage'],
  report: (params: GetUsageQueryParams) => [...usageKeys.all, params],
  series: (params: GetUsageSeriesQueryParams) => [...usageKeys.all, 'series', params],
} as const;

export const usageQueryOptions = (params: GetUsageQueryParams = {}): UseQueryOptions<UsageResponse, ApiError> =>
  queryOptions<UsageResponse, ApiError>({
    queryKey: usageKeys.report(params),
    queryFn: ({ signal }) =>
      APIRequest.get('/admin/usage')
        .query({ ...params })
        .signal(signal)
        .execute(),
  });

export const usageSeriesQueryOptions = (params: GetUsageSeriesQueryParams = {}): UseQueryOptions<UsageSeriesResponse, ApiError> =>
  queryOptions<UsageSeriesResponse, ApiError>({
    queryKey: usageKeys.series(params),
    queryFn: ({ signal }) =>
      APIRequest.get('/admin/usage/series')
        .query({ ...params })
        .signal(signal)
        .execute(),
  });
