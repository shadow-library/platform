import { createFileRoute } from '@tanstack/react-router';

import { MealsScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_app/log/meals')({ component: MealsScreen });
