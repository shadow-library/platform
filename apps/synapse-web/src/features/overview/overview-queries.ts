import { type QueryClient, type UseQueryOptions } from '@tanstack/react-query';

import { prefetchActiveCatalog } from '@/features/catalog';
import {
  type ApiError,
  budgetStatusQueryOptions,
  type Capabilities,
  type GetUsageQueryParams,
  usageQueryOptions,
  type UsageResponse,
  usageSeriesQueryOptions,
  type UsageSeriesResponse,
} from '@/lib';

import { lastDays, type OverviewPeriods, type SpendRange, type UsageWindow } from './overview-periods';

export const DEFAULT_SPEND_RANGE: SpendRange = 30;
export const FEATURE_SPEND_DAYS: SpendRange = 30;

function windowParams(window: UsageWindow, groupBy: 'app' | 'task'): GetUsageQueryParams {
  return { groupBy, from: window.from, ...(window.to && { to: window.to }) };
}

export const monthUsageOptions = (window: UsageWindow): UseQueryOptions<UsageResponse, ApiError> => usageQueryOptions(windowParams(window, 'app'));

export const dailySpendOptions = (today: string, range: SpendRange): UseQueryOptions<UsageSeriesResponse, ApiError> =>
  usageSeriesQueryOptions(windowParams(lastDays(today, range), 'app'));

export const featureSpendWindow = (today: string): UsageWindow => lastDays(today, FEATURE_SPEND_DAYS);

export const featureSpendOptions = (today: string): UseQueryOptions<UsageResponse, ApiError> => usageQueryOptions(windowParams(featureSpendWindow(today), 'task'));

export async function prefetchOverview(queryClient: QueryClient, capabilities: Capabilities, { today, month }: OverviewPeriods): Promise<void> {
  if (!capabilities.readUsage) return;
  const catalog = capabilities.readCatalog ? prefetchActiveCatalog(queryClient).catch(() => undefined) : undefined;
  await Promise.all([
    queryClient.prefetchQuery(monthUsageOptions(month.current)),
    month.previous ? queryClient.prefetchQuery(monthUsageOptions(month.previous)) : undefined,
    queryClient.prefetchQuery(dailySpendOptions(today, DEFAULT_SPEND_RANGE)),
    queryClient.prefetchQuery(featureSpendOptions(today)),
    queryClient.prefetchQuery(budgetStatusQueryOptions()),
    catalog,
  ]);
}
