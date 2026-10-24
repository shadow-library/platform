import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useCapabilities } from '@/lib';

export function BudgetsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readUsage} area="budgets">
      <PageHeader title="Budgets" subtitle="Limits on what each app may spend on AI, and how close each one is to its limit right now." />
      <EmptyState title="This screen is being built" description="Until it is ready, the advanced editor covers it." />
    </PermissionGate>
  );
}
