/**
 * Importing npm packages
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { type ApiError, APIRequest } from '@shadow-library/web';

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

export function useStatsQuery(): UseQueryResult<DashboardStats, ApiError> {
  return useQuery<DashboardStats, ApiError>({
    queryKey: dashboardKeys.stats,
    queryFn: ({ signal }) => APIRequest.get('/api/v1/dashboard/stats').signal(signal).execute(),
  });
}
