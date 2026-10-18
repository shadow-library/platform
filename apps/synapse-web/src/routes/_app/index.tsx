import { createFileRoute, redirect } from '@tanstack/react-router';

import { Overview } from '@/features/overview';
import { draftQueryOptions, loadCapabilities, providersQueryOptions, usageQueryOptions, versionsQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/')({
  beforeLoad: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog && capabilities.readUsage) throw redirect({ to: '/usage', search: { groupBy: 'app' } });
  },
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    await Promise.all([
      queryClient.prefetchQuery(versionsQueryOptions()),
      queryClient.prefetchQuery(draftQueryOptions()),
      queryClient.prefetchQuery(providersQueryOptions()),
      ...(capabilities.readUsage ? [queryClient.prefetchQuery(usageQueryOptions({ groupBy: 'app' }))] : []),
    ]);
  },
  head: () => ({ meta: [{ title: 'Overview · Shadow Synapse' }] }),
  component: Overview,
});
