import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { BudgetsScreen } from '@/features/budgets';
import { prefetchActiveCatalog } from '@/features/catalog';
import { budgetStatusQueryOptions, loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/budgets/')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (!capabilities.readUsage) return;
    const catalog = capabilities.readCatalog ? prefetchActiveCatalog(queryClient).catch(() => undefined) : undefined;
    await Promise.all([queryClient.prefetchQuery(budgetStatusQueryOptions()), catalog]);
  },
  head: () => ({ meta: [{ title: 'Budgets · Shadow Synapse' }] }),
  component: BudgetsRoute,
});

function BudgetsRoute(): ReactElement {
  return <BudgetsScreen />;
}
