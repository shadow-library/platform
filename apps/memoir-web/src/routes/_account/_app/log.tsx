import { createFileRoute } from '@tanstack/react-router';

import { QuickLogScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_account/_app/log')({ staticData: { title: 'Quick log' }, component: QuickLogScreen });
