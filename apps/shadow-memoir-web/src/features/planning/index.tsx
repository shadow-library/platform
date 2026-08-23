import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function PlanningBoardScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Planning Board"
      summary="A week and month view of scheduled occurrences: drag to reschedule within the caps, read the day's load against capacity, and lock the day's plan."
    />
  );
}
