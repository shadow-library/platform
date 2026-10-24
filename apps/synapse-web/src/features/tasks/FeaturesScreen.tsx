import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function FeaturesScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title="Features" subtitle="Every AI feature in our apps, the model that answers it, and what it costs." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
