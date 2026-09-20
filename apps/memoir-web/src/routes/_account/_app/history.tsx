import { createFileRoute } from '@tanstack/react-router';

import { HistoryScreen } from '@/features/history';

export const Route = createFileRoute('/_account/_app/history')({ staticData: { title: 'History' }, component: HistoryScreen });
