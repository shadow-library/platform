import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type CommandHandle, type LocalReading, useDomainCommand } from './command-runner';
import { useMemoirData } from './data-context';
import {
  type CategoriesView,
  type ExpensePage,
  type ExpenseQuery,
  type ExpenseView,
  type FinanceCommand,
  type FinanceCommandResult,
  type FinanceSummary,
  type ReceiptScanQuota,
  type SubscriptionsView,
} from './finance.types';

const financeKeys = {
  all: ['memoir', 'finance'] as const,
  summary: () => ['memoir', 'finance', 'summary'] as const,
  expenses: (query: ExpenseQuery) => ['memoir', 'finance', 'expenses', query] as const,
  expense: (id: string) => ['memoir', 'finance', 'expense', id] as const,
  subscriptions: () => ['memoir', 'finance', 'subscriptions'] as const,
  categories: () => ['memoir', 'finance', 'categories'] as const,
  receiptScanQuota: () => ['memoir', 'receipt-scan-quota'] as const,
};

export function useFinanceSummary(): UseQueryResult<FinanceSummary> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.summary(), queryFn: () => finance.summary() }, queryClient);
}

export function useExpenses(query: ExpenseQuery): UseQueryResult<ExpensePage> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.expenses(query), queryFn: () => finance.expenses(query), placeholderData: keepPreviousData }, queryClient);
}

export function useExpense(id: string): UseQueryResult<ExpenseView> {
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

export function useReceiptScanQuota(): UseQueryResult<ReceiptScanQuota> {
  const { finance, queryClient } = useMemoirData();
  return useQuery({ queryKey: financeKeys.receiptScanQuota(), queryFn: () => finance.receiptScanQuota() }, queryClient);
}

export type FinanceCommandHook = CommandHandle<FinanceCommand, FinanceCommandResult>;

function readFinanceResult(result: FinanceCommandResult): LocalReading<FinanceCommandResult> {
  return { kind: 'done', local: result, delivery: result.delivery, xpAwarded: 0, coinsAwarded: 0 };
}

export function useFinanceCommand(): FinanceCommandHook {
  const { finance, queryClient } = useMemoirData();
  return useDomainCommand({
    dispatch: (command, options) => finance.dispatchCommand(command, options),
    read: readFinanceResult,
    queryClient,
    queryKey: financeKeys.all,
  });
}
