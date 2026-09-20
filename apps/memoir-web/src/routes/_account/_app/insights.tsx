import { createFileRoute } from '@tanstack/react-router';

import { InsightsScreen, validateInsightsSearch } from '@/features/insights';

export const Route = createFileRoute('/_account/_app/insights')({ validateSearch: validateInsightsSearch, staticData: { title: 'Insights' }, component: InsightsScreen });
