import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { CommandRefusedError } from './command-feedback';
import { type CommandHook, type LocalReading, useDomainCommand } from './command-runner';
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

const financeKeys = {
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

export type FinanceCommandHook = CommandHook<FinanceCommand, FinanceCommandResult, FinanceCommandResult>;

function readFinanceResult(result: FinanceCommandResult): LocalReading<FinanceCommandResult> {
  return { kind: 'done', local: result, delivery: result.delivery, xpAwarded: 0, coinsAwarded: 0 };
}

function legacyFinanceResult(result: FinanceCommandResult): FinanceCommandResult {
  if (result.delivery?.status === 'refused') throw new CommandRefusedError(result.delivery.boundary);
  return result;
}

export function useFinanceCommand(): FinanceCommandHook {
  const { finance, queryClient } = useMemoirData();
  return useDomainCommand({
    queryClient,
    dispatch: (command, options) => finance.dispatchCommand(command, options),
    read: readFinanceResult,
    legacy: legacyFinanceResult,
    refresh: () => queryClient.invalidateQueries({ queryKey: financeKeys.all }),
  });
}
