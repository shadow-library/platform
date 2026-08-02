/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { Dashboard } from '@/features/dashboard';
import { dashboardStatsQueryOptions } from '@/lib/apis';

// Delivery stats are the dashboard's only query and gate its own loading state, so the loader prefetches
// it — the KPIs and trend chart render on the server instead of the loading spinner.
export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(dashboardStatsQueryOptions()),
  component: Dashboard,
});
