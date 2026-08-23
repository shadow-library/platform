import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function ExpensesScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Money"
      summary="Expenses with amount, currency, category, merchant and receipt, the receipt extraction flow, and home-currency conversion at the rate locked when the entry was made."
    />
  );
}

export function SubscriptionsScreen(): ReactElement {
  return <ScreenPlaceholder title="Subscriptions" summary="Recurring charges with their due states and the confirm-cycle flow. An overdue item is amber, never red." />;
}
