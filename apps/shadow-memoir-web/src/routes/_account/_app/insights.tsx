import { createFileRoute } from '@tanstack/react-router';

import { InsightsScreen } from '@/features/insights';

export const Route = createFileRoute('/_account/_app/insights')({ component: InsightsScreen });
