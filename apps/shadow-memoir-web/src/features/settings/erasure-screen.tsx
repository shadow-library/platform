import { type ReactElement } from 'react';

import { StatusPage } from '@/components/StatusPage';
import { type ErasureDevice } from '@/lib/data';

export type ErasureDeviceState = ErasureDevice | 'unknown';

const DEVICE_COPY: Record<ErasureDeviceState, string | null> = {
  removed: 'The copy on this device has already been removed.',
  kept: 'This device’s copy couldn’t be removed — sign out on this device to clear it.',
  unknown: null,
};

export function toErasureDeviceState(value: unknown): ErasureDeviceState {
  return value === 'removed' || value === 'kept' ? value : 'unknown';
}

export function ErasureStartedScreen({ device }: { device: ErasureDeviceState }): ReactElement {
  const description = [
    'Shadow Memoir has started erasing everything it holds about you, and it finishes on its own even if you close this page.',
    DEVICE_COPY[device],
    'Once your records are gone, Shadow is asked to close your Shadow account, and after that signing in to any Shadow app with it stops working.',
  ]
    .filter(Boolean)
    .join(' ');

  return <StatusPage variant="page" title="Your data is being erased" description={description} />;
}
