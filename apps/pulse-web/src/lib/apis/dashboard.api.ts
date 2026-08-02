/**
 * Importing npm packages
 */
import { queryOptions, useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from './transport';

/**
 * Importing user defined packages
 */
import { type DashboardStats } from './api-types.gen';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const dashboardKeys = {
  stats: ['stats'],
} as const;

/** Shared by the dashboard route's loader prefetch and `useStatsQuery` — identical key + fn, so SSR-dehydrated data hydrates without a second request. */
export const dashboardStatsQueryOptions = (): UseQueryOptions<DashboardStats, ApiError> =>
  queryOptions<DashboardStats, ApiError>({
    queryKey: dashboardKeys.stats,
    queryFn: () => APIRequest.get('/dashboard/stats').execute(),
  });

export function useStatsQuery(): UseQueryResult<DashboardStats, ApiError> {
  return useQuery(dashboardStatsQueryOptions());
}
