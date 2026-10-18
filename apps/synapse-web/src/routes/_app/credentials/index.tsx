import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { CredentialsScreen } from '@/features/credentials';
import { credentialsQueryOptions, loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/credentials/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.manageCredentials) await queryClient.prefetchQuery(credentialsQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Credentials · Shadow Synapse' }] }),
  component: CredentialsRoute,
});

function CredentialsRoute(): ReactElement {
  return <CredentialsScreen />;
}
