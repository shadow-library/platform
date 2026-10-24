import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ProvidersScreen } from '@/features/providers';
import { loadCapabilities, providersQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/providers/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readCatalog) await queryClient.prefetchQuery(providersQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Providers · Shadow Synapse' }] }),
  component: ProvidersRoute,
});

function ProvidersRoute(): ReactElement {
  return <ProvidersScreen />;
}
