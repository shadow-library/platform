import { createFileRoute } from '@tanstack/react-router';

import { SubscriptionsScreen } from '@/features/finance';

export const Route = createFileRoute('/_account/_app/finance/subscriptions')({ staticData: { title: 'Subscriptions' }, component: SubscriptionsScreen });
