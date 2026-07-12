/**
 * Importing npm packages
 */
import { useMemo } from 'react';

/**
 * Declaring the constants
 */
const DEVICE_ID_KEY = 'shadow-identity-device-id';

/**
 * A stable per-browser device id, persisted in localStorage. The auth flows pass it to the flow
 * `init` endpoints so the server can bind challenges and remember trusted devices across sessions.
 */
export function useDeviceId(): string {
  return useMemo(() => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }, []);
}
