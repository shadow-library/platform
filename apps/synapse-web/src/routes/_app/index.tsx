import { createFileRoute, redirect } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { overviewPeriods, OverviewScreen, prefetchOverview } from '@/features/overview';
import { loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/')({
  beforeLoad: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readUsage && capabilities.readCatalog) throw redirect({ to: '/features' });
  },
  loader: async ({ context: { queryClient } }) => {
    const periods = overviewPeriods(new Date());
    await prefetchOverview(queryClient, await loadCapabilities(queryClient), periods);
    return periods;
  },
  head: () => ({ meta: [{ title: 'Overview · Shadow Synapse' }] }),
  component: OverviewRoute,
});

function OverviewRoute(): ReactElement {
  const periods = Route.useLoaderData();
  return <OverviewScreen periods={periods} />;
}
