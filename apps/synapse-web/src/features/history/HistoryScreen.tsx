import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function HistoryScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title="History" subtitle="Every published version of the catalog: what changed, who changed it and when." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
