import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ExpenseDetailScreen } from '@/features/finance';

export const Route = createFileRoute('/_account/_app/finance/expenses/$expenseId')({ staticData: { title: 'Expense' }, component: ExpenseDetailRoute });

function ExpenseDetailRoute(): ReactElement {
  const { expenseId } = Route.useParams();
  return <ExpenseDetailScreen expenseId={expenseId} />;
}
