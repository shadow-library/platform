import { type QueryClient } from '@tanstack/react-query';

import { invalidateSoon } from './batched-invalidation';

const ledgerKeys = {
  all: (projectId: string) => ['projects', projectId, 'ledger'] as const,
};

export function invalidateLedger(queryClient: QueryClient, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: ledgerKeys.all(projectId) });
}
