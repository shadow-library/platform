import { queryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { type BudgetStatusResponse } from './api-types.gen';
import { type ApiError, APIRequest, isApiError } from './transport';

const NO_ACTIVE_CATALOG = 'SYN_NO_ACTIVE_CATALOG';
const MAX_RETRIES = 3;

export const budgetKeys = { all: ['budgets'], status: () => [...budgetKeys.all, 'status'] } as const;

/** Answered with 503 until a first catalog version goes live: a state to show, which retrying cannot change. */
export function isNoActiveCatalog(error: unknown): boolean {
  return isApiError(error) && error.code === NO_ACTIVE_CATALOG;
}

export const budgetStatusQueryOptions = (): UseQueryOptions<BudgetStatusResponse, ApiError> =>
  queryOptions<BudgetStatusResponse, ApiError>({
    queryKey: budgetKeys.status(),
    queryFn: ({ signal }) => APIRequest.get('/admin/budgets/status').signal(signal).execute(),
    retry: (failures, error) => !isNoActiveCatalog(error) && failures < MAX_RETRIES,
  });
