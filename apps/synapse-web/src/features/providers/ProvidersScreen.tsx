import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function ProvidersScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title="Providers" subtitle="The services that run our models, how they are holding up, and the API key each one uses." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
