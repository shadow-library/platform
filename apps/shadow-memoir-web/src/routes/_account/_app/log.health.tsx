import { createFileRoute } from '@tanstack/react-router';

import { HealthMetricsScreen } from '@/features/quick-logs';

export const Route = createFileRoute('/_account/_app/log/health')({ component: HealthMetricsScreen });
