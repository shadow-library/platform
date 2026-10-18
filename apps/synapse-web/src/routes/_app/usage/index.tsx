import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { parseUsageSearch, usageParams, UsageScreen } from '@/features/usage';
import { loadCapabilities, usageQueryOptions } from '@/lib';

export const Route = createFileRoute('/_app/usage/')({
  validateSearch: (search: Record<string, unknown>) => parseUsageSearch(search, new Date()),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readUsage) await queryClient.prefetchQuery(usageQueryOptions(usageParams(deps)));
  },
  head: () => ({ meta: [{ title: 'Usage · Shadow Synapse' }] }),
  component: UsageRoute,
});

function UsageRoute(): ReactElement {
  const search = Route.useSearch();
  return <UsageScreen search={search} />;
}
