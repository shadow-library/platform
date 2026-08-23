import { createFileRoute } from '@tanstack/react-router';

import { SubscriptionsScreen } from '@/features/finance';

export const Route = createFileRoute('/_app/finance/subscriptions')({ component: SubscriptionsScreen });
