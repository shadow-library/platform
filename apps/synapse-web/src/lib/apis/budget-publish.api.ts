import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { type CatalogInvalidResponse, type CatalogVersionSummaryResponse, type PublishBudgetsBody } from './api-types.gen';
import { budgetKeys } from './budgets.api';
import { catalogKeys } from './catalog.api';
import { catalogWriteOutcome, type CatalogWriteOutcome, UNPROCESSABLE } from './catalog-outcome';
import { type ApiError, APIRequest } from './transport';

export interface PublishBudgetsInput {
  budgets: readonly unknown[];
  expectedVersion: number;
  note?: string;
}

export type PublishBudgetsOutcome = CatalogWriteOutcome<CatalogVersionSummaryResponse>;

export async function publishBudgets(input: PublishBudgetsInput): Promise<PublishBudgetsOutcome> {
  const body: PublishBudgetsBody = { ...input, budgets: input.budgets as PublishBudgetsBody['budgets'] };
  return catalogWriteOutcome(await APIRequest.put('/admin/catalog/budgets').body(body).modeled(UNPROCESSABLE).execute<CatalogVersionSummaryResponse | CatalogInvalidResponse>());
}

export function usePublishBudgetsMutation(): UseMutationResult<PublishBudgetsOutcome, ApiError, PublishBudgetsInput> {
  const queryClient = useQueryClient();
  return useMutation<PublishBudgetsOutcome, ApiError, PublishBudgetsInput>({
    mutationFn: publishBudgets,
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: catalogKeys.all }), queryClient.invalidateQueries({ queryKey: budgetKeys.all })]),
  });
}
