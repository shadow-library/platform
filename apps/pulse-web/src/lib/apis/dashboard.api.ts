/**
 * Importing npm packages
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
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

export function useStatsQuery(): UseQueryResult<DashboardStats, ApiError> {
  return useQuery<DashboardStats, ApiError>({
    queryKey: dashboardKeys.stats,
    queryFn: () => APIRequest.get('/dashboard/stats').execute(),
  });
}
