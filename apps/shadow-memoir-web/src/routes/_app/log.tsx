import { createFileRoute } from '@tanstack/react-router';

import { QuickLogScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_app/log')({ component: QuickLogScreen });
