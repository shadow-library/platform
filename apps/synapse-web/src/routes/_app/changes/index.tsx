import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog } from '@/features/catalog';
import { ChangesScreen } from '@/features/changes';
import { draftQueryOptions, loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/changes/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    await Promise.all([prefetchActiveCatalog(queryClient), queryClient.prefetchQuery(draftQueryOptions())]);
  },
  head: () => ({ meta: [{ title: 'Review & publish · Shadow Synapse' }] }),
  component: ChangesRoute,
});

function ChangesRoute(): ReactElement {
  return <ChangesScreen />;
}
