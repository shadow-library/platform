import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { ExpenseDetailScreen } from '@/features/finance';

export const Route = createFileRoute('/_app/finance/expenses/$expenseId')({ component: ExpenseDetailRoute });

function ExpenseDetailRoute(): ReactElement {
  const { expenseId } = Route.useParams();
  return <ExpenseDetailScreen expenseId={expenseId} />;
}
