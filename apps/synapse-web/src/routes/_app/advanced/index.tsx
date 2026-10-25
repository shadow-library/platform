import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { AdvancedScreen } from '@/features/advanced';
import { activeVersionOf } from '@/features/catalog';
import { draftQueryOptions, loadCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

/** The editor's buffer starts from the draft, or from the active version when there is none, so both are loaded before it mounts. */
export const Route = createFileRoute('/_app/advanced/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readCatalog) return;
    const [versions] = await Promise.all([queryClient.ensureQueryData(versionsQueryOptions()), queryClient.ensureQueryData(draftQueryOptions())]);
    const active = activeVersionOf(versions.items);
    if (active) await queryClient.ensureQueryData(versionQueryOptions(active.version));
  },
  head: () => ({ meta: [{ title: 'Advanced editor · Shadow Synapse' }] }),
  component: AdvancedRoute,
});

function AdvancedRoute(): ReactElement {
  return <AdvancedScreen />;
}
