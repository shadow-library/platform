import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog } from '@/features/catalog';
import { ModelsScreen } from '@/features/models';
import { draftQueryOptions, loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/models/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readCatalog) await Promise.all([queryClient.prefetchQuery(draftQueryOptions()), prefetchActiveCatalog(queryClient)]);
  },
  head: () => ({ meta: [{ title: 'Models · Shadow Synapse' }] }),
  component: ModelsRoute,
});

function ModelsRoute(): ReactElement {
  return <ModelsScreen />;
}
