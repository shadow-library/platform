/**
 * Importing npm packages
 */
import { useEffect, useState } from 'react';

/**
 * Declaring the constants
 */
const DEVICE_ID_KEY = 'shadow-identity-device-id';

/**
 * A stable per-browser device id, persisted in localStorage. The auth flows pass it to the flow `init`
 * endpoints so the server can bind challenges and remember trusted devices across sessions.
 *
 * localStorage doesn't exist during SSR, so the id is resolved in an effect (never during render): the
 * value is an empty string on the server and the first client render — identical, so no hydration
 * mismatch — then becomes the persisted id after mount, well before any flow submission reads it.
 */
export function useDeviceId(): string {
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    // Reading/persisting the localStorage device id is exactly the external-system sync effects are for;
    // it can only run client-side, so the one-shot state update on mount is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceId(id);
  }, []);

  return deviceId;
}
