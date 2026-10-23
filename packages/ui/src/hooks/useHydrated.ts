import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => undefined;
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * `false` on the server and during the hydration render, `true` once hydration completes (immediately in a client-only render).
 * Gate output that cannot exist in server HTML behind it so the hydration render matches the server.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
