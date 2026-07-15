/**
 * Importing npm packages
 */
import { useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */
const DEFAULT_STORAGE_KEY = 'shadow-device-id';

/**
 * A stable per-browser device id, persisted in localStorage. Auth flows pass it to the flow `init`
 * endpoints so the server can bind challenges and remember trusted devices across sessions.
 *
 * localStorage doesn't exist during SSR, so the id resolves in an effect (never during render): the value
 * is an empty string on the server and the first client render — identical, so no hydration mismatch — then
 * becomes the persisted id after mount, well before any flow submission reads it.
 */
export function useDeviceId(storageKey: string = DEFAULT_STORAGE_KEY): string {
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    setDeviceId(id);
  }, [storageKey]);

  return deviceId;
}
