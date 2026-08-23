import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function OnboardingScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="Set up"
      summary="Two essentials — home currency and your wake and sleep window — then a guided first quest. Under two minutes, and every step is skippable."
    />
  );
}
