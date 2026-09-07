/**
 * Importing npm packages
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Declaring the constants
 */
const DEFAULT_STORAGE_KEY = 'shadow-device-id';

const deviceIds = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function ensureDeviceId(storageKey: string): void {
  if (deviceIds.has(storageKey)) return;
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }
  deviceIds.set(storageKey, id);
  for (const listener of listeners.get(storageKey) ?? []) listener();
}

function createSubscription(storageKey: string): (onStoreChange: () => void) => () => void {
  return onStoreChange => {
    let keyListeners = listeners.get(storageKey);
    if (!keyListeners) {
      keyListeners = new Set();
      listeners.set(storageKey, keyListeners);
    }
    keyListeners.add(onStoreChange);
    ensureDeviceId(storageKey);
    return () => void keyListeners.delete(onStoreChange);
  };
}

function getServerDeviceId(): string {
  return '';
}

/**
 * A stable per-browser device id, persisted in localStorage. Auth flows pass it to the flow `init`
 * endpoints so the server can bind challenges and remember trusted devices across sessions.
 *
 * localStorage doesn't exist during SSR, so the id is read (and created on first visit) when the store is
 * subscribed after mount: the value is an empty string on the server and during hydration — identical, so no
 * hydration mismatch — then becomes the persisted id, well before any flow submission reads it.
 */
export function useDeviceId(storageKey: string = DEFAULT_STORAGE_KEY): string {
  const subscribe = useMemo(() => createSubscription(storageKey), [storageKey]);
  const getSnapshot = useCallback(() => deviceIds.get(storageKey) ?? '', [storageKey]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerDeviceId);
}
