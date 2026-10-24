import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog } from '@/features/catalog';
import { parseUsageSearch, usageParams, UsageScreen } from '@/features/usage';
import { loadCapabilities, usageQueryOptions, usageSeriesQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/usage/')({
  validateSearch: (search: Record<string, unknown>) => parseUsageSearch(search, new Date()),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readUsage) return;
    const params = usageParams(deps);
    await Promise.all([
      queryClient.prefetchQuery(usageQueryOptions(params)),
      queryClient.prefetchQuery(usageSeriesQueryOptions(params)),
      capabilities.readCatalog ? prefetchActiveCatalog(queryClient).catch(() => undefined) : undefined,
    ]);
  },
  head: () => ({ meta: [{ title: 'Usage · Shadow Synapse' }] }),
  component: UsageRoute,
});

function UsageRoute(): ReactElement {
  const search = Route.useSearch();
  return <UsageScreen search={search} />;
}
