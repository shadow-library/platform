import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useMemoirData } from './data-context';
import {
  type CategoriesView,
  type ExpenseDetail,
  type ExpensePage,
  type ExpenseQuery,
  type FinanceCommand,
  type FinanceCommandResult,
  type FinanceRange,
  type FinanceSummary,
  type SubscriptionsView,
} from './finance.types';

export const financeKeys = {
  all: ['memoir', 'finance'] as const,
  summary: (range: FinanceRange) => ['memoir', 'finance', 'summary', range] as const,
  expenses: (query: ExpenseQuery) => ['memoir', 'finance', 'expenses', query] as const,
  expense: (id: string) => ['memoir', 'finance', 'expense', id] as const,
  subscriptions: () => ['memoir', 'finance', 'subscriptions'] as const,
  categories: () => ['memoir', 'finance', 'categories'] as const,
};

export function useFinanceSummary(range: FinanceRange): UseQueryResult<FinanceSummary> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.summary(range), queryFn: () => finance.summary(range) }, queryClient);
}

export function useExpenses(query: ExpenseQuery): UseQueryResult<ExpensePage> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.expenses(query), queryFn: () => finance.expenses(query) }, queryClient);
}

export function useExpense(id: string): UseQueryResult<ExpenseDetail | null> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.expense(id), queryFn: () => finance.expense(id) }, queryClient);
}

export function useSubscriptions(): UseQueryResult<SubscriptionsView> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.subscriptions(), queryFn: () => finance.subscriptions() }, queryClient);
}

export function useExpenseCategories(): UseQueryResult<CategoriesView> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.categories(), queryFn: () => finance.categories() }, queryClient);
}

export function useFinanceCommand(): UseMutationResult<FinanceCommandResult, Error, FinanceCommand> {
  const { finance, queryClient } = useMemoirData();
  return useMutation(
    { mutationFn: (command: FinanceCommand) => finance.dispatchCommand(command), onSuccess: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }) },
    queryClient,
  );
}
