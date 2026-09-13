import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { type ErasureDeviceState, ErasureStartedScreen, toErasureDeviceState } from '@/features/settings';

interface ErasureSearch {
  device: ErasureDeviceState;
}

export const Route = createFileRoute('/erasure')({
  validateSearch: (search: Record<string, unknown>): ErasureSearch => ({ device: toErasureDeviceState(search.device) }),
  head: () => ({ meta: [{ title: 'Erasing your data · Shadow Memoir' }] }),
  component: ErasureRoute,
});

function ErasureRoute(): ReactElement {
  const { device } = Route.useSearch();
  return <ErasureStartedScreen device={device} />;
}
