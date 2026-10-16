import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { activeVersionOf, type CatalogTab, CatalogWorkspace, parseCatalogTab } from '@/features/catalog';
import { draftQueryOptions, loadCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

interface CatalogSearch {
  tab: CatalogTab;
}

/** The editor's buffer starts from the draft, or from the active version when there is none, so both are loaded before it mounts. */
export const Route = createFileRoute('/_app/catalog/')({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => ({ tab: parseCatalogTab(search.tab) }),
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    const [versions] = await Promise.all([queryClient.ensureQueryData(versionsQueryOptions()), queryClient.ensureQueryData(draftQueryOptions())]);
    const active = activeVersionOf(versions.items);
    if (active) await queryClient.ensureQueryData(versionQueryOptions(active.version));
  },
  head: () => ({ meta: [{ title: 'Catalog · Shadow Synapse' }] }),
  component: CatalogRoute,
});

function CatalogRoute(): ReactElement {
  const { tab } = Route.useSearch();
  return <CatalogWorkspace tab={tab} />;
}
