/**
 * Importing npm packages
 */
import { useDeviceId as useSharedDeviceId } from '@shadow-library/web';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The stable per-browser device id now comes from `@shadow-library/web`'s shared hook (same SSR-safe
 * localStorage semantics the app previously hand-rolled). Only the storage key is bound here — it must
 * stay `shadow-identity-device-id` so device ids persisted before the migration keep identifying the
 * same trusted devices.
 */
const DEVICE_ID_KEY = 'shadow-identity-device-id';

export function useDeviceId(): string {
  return useSharedDeviceId(DEVICE_ID_KEY);
}
