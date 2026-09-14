import { createFileRoute } from '@tanstack/react-router';

import { ExpensesScreen, validateFinanceSearch } from '@/features/finance';

export const Route = createFileRoute('/_account/_app/finance/')({ validateSearch: validateFinanceSearch, staticData: { title: 'Money' }, component: ExpensesScreen });
