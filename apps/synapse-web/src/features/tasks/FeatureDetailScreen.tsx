import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { splitTaskKey } from '@/features/catalog';
import { PageHeader, PermissionGate, taskTitle } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function FeatureDetailScreen({ taskKey }: { taskKey: string }): ReactElement {
  const capabilities = useCapabilities();
  const parts = splitTaskKey(taskKey);
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title={parts ? taskTitle(parts) : taskKey} subtitle="Which model answers this feature, how much effort it spends, and which model names people may pick." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
