import { useCallback, useMemo, useSyncExternalStore } from 'react';

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

/** Empty string on the server and during hydration (no localStorage, no mismatch), then the persisted id once the store is subscribed after mount. */
export function useDeviceId(storageKey: string = DEFAULT_STORAGE_KEY): string {
  const subscribe = useMemo(() => createSubscription(storageKey), [storageKey]);
  const getSnapshot = useCallback(() => deviceIds.get(storageKey) ?? '', [storageKey]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerDeviceId);
}
