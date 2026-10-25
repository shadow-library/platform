import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { AliasesScreen, type AliasesSearch, aliasKeysOf } from '@/features/aliases';
import { activeVersionOf, prefetchActiveCatalog } from '@/features/catalog';
import { aliasImpactQueryOptions, loadCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

export const Route = createFileRoute('/_app/aliases/')({
  validateSearch: (search: Record<string, unknown>): AliasesSearch => {
    const alias = text(search.alias);
    const model = alias ? text(search.model) : undefined;
    return { ...(alias && { alias }), ...(model && { model }) };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, deps }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    await prefetchActiveCatalog(queryClient);
    if (!deps.alias) return;
    const versions = await queryClient.ensureQueryData(versionsQueryOptions());
    const active = activeVersionOf(versions.items);
    const detail = active ? await queryClient.ensureQueryData(versionQueryOptions(active.version)).catch(() => undefined) : undefined;
    if (detail && aliasKeysOf(detail.document).includes(deps.alias)) await queryClient.prefetchQuery(aliasImpactQueryOptions(deps.alias, deps.model));
  },
  head: () => ({ meta: [{ title: 'Model names · Shadow Synapse' }] }),
  component: AliasesRoute,
});

function AliasesRoute(): ReactElement {
  const search = Route.useSearch();
  return <AliasesScreen search={search} />;
}
