import { createFileRoute } from '@tanstack/react-router';

import { HistoryScreen } from '@/features/history';

export const Route = createFileRoute('/_app/history')({ component: HistoryScreen });
