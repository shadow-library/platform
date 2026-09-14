import { createFileRoute } from '@tanstack/react-router';

import { ExpensesScreen, validateFinanceSearch } from '@/features/finance';

export const Route = createFileRoute('/_app/finance/')({ validateSearch: validateFinanceSearch, component: ExpensesScreen });
