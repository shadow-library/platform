import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog } from '@/features/catalog';
import { ModelsScreen } from '@/features/models';
import { loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/models/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readCatalog) await prefetchActiveCatalog(queryClient);
  },
  head: () => ({ meta: [{ title: 'Models · Shadow Synapse' }] }),
  component: ModelsRoute,
});

function ModelsRoute(): ReactElement {
  return <ModelsScreen />;
}
