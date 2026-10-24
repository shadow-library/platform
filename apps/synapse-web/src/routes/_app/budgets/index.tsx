import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { BudgetsScreen } from '@/features/budgets';
import { budgetStatusQueryOptions, loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/budgets/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readUsage) await queryClient.prefetchQuery(budgetStatusQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Budgets · Shadow Synapse' }] }),
  component: BudgetsRoute,
});

function BudgetsRoute(): ReactElement {
  return <BudgetsScreen />;
}
