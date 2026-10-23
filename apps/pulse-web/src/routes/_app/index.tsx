import { createFileRoute } from '@tanstack/react-router';

import { Dashboard } from '@/features/dashboard';
import { dashboardStatsQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => context.queryClient.prefetchQuery(dashboardStatsQueryOptions()),
  component: Dashboard,
});
