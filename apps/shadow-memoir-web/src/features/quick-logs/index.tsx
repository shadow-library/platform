import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function QuickLogScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Quick log"
      summary="Journal with mood, meals with presets, weight, side quests and the manual health metrics — steps, calories burned, sleep and water. Each entry completes in under ten seconds."
    />
  );
}
