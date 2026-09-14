import { createFileRoute } from '@tanstack/react-router';

import { BillingScreen } from '@/features/settings';

export const Route = createFileRoute('/_account/_app/settings/billing')({ component: BillingScreen });
