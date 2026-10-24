import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog } from '@/features/catalog';
import { FeaturesScreen } from '@/features/tasks';
import { draftQueryOptions, loadCapabilities, usageQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/features/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    await Promise.all([
      prefetchActiveCatalog(queryClient),
      queryClient.prefetchQuery(draftQueryOptions()),
      capabilities.readUsage ? queryClient.prefetchQuery(usageQueryOptions({ groupBy: 'task' })) : undefined,
    ]);
  },
  head: () => ({ meta: [{ title: 'Features · Shadow Synapse' }] }),
  component: FeaturesRoute,
});

function FeaturesRoute(): ReactElement {
  return <FeaturesScreen />;
}
