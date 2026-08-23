import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function TodayScreen(): ReactElement {
  return <ScreenPlaceholder title="Today" summary="Today's quest occurrences, one-tap complete, partial, skip and postpone, with HP, momentum and the Crown period at a glance." />;
}
