import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function InsightsScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Insights"
      summary="Hero progression, spending, the adherence calendar, streaks, per-metric detail, body trend and calorie balance, all under one date-range selector."
    />
  );
}
