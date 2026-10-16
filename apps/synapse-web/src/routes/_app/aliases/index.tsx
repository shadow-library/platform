import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { activeVersionOf } from '@/features/catalog';
import { AliasesScreen, type AliasesSearch } from '@/features/aliases';
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
    const versions = await queryClient.ensureQueryData(versionsQueryOptions());
    const active = activeVersionOf(versions.items);
    if (active) await queryClient.prefetchQuery(versionQueryOptions(active.version));
    if (deps.alias) await queryClient.prefetchQuery(aliasImpactQueryOptions(deps.alias, deps.model));
  },
  head: () => ({ meta: [{ title: 'Aliases · Shadow Synapse' }] }),
  component: AliasesRoute,
});

function AliasesRoute(): ReactElement {
  const search = Route.useSearch();
  return <AliasesScreen search={search} />;
}
