import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function WeeklyReviewScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Weekly Review"
      summary="An opt-in ritual: last week's adherence, money and body trend, one pattern drawn from the reason tags, ending in next week's plan on the Planning Board."
    />
  );
}
