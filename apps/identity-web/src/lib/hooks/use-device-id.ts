import { useDeviceId as useSharedDeviceId } from '@shadow-library/web';

/** The storage key must stay `shadow-identity-device-id` so previously persisted ids keep identifying the same trusted devices. */
const DEVICE_ID_KEY = 'shadow-identity-device-id';

export function useDeviceId(): string {
  return useSharedDeviceId(DEVICE_ID_KEY);
}
