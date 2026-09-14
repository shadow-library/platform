import { createFileRoute } from '@tanstack/react-router';

import { WeightScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_account/_app/log/weight')({ component: WeightScreen });
