import { createFileRoute } from '@tanstack/react-router';

import { ExpensesScreen } from '@/features/finance';

export const Route = createFileRoute('/_app/finance/')({ component: ExpensesScreen });
