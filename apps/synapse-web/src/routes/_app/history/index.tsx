import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { HistoryScreen } from '@/features/history';
import { loadCapabilities, versionsQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/history/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readCatalog) await queryClient.prefetchQuery(versionsQueryOptions());
  },
  head: () => ({ meta: [{ title: 'History · Shadow Synapse' }] }),
  component: HistoryRoute,
});

function HistoryRoute(): ReactElement {
  return <HistoryScreen />;
}
