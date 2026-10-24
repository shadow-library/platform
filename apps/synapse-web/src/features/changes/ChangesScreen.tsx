import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function ChangesScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title="Review & publish" subtitle="Changes saved in the shared draft. Nothing reaches the apps until they are published." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
