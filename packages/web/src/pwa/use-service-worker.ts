/**
 * Importing npm packages
 */
import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * Importing user defined packages
 */
import { isServiceWorkerSupported, registerServiceWorker, type RegisterServiceWorkerOptions, type ServiceWorkerController } from './register';

/**
 * Defining types
 */
export interface UseServiceWorker {
  isSupported: boolean;
  isRegistered: boolean;
  /** A new worker is installed and waiting — show a refresh prompt, then call `applyUpdate()`. */
  updateAvailable: boolean;
  applyUpdate: () => void;
  controller: ServiceWorkerController | null;
}

interface ServiceWorkerSnapshot {
  isSupported: boolean;
  isRegistered: boolean;
  updateAvailable: boolean;
  controller: ServiceWorkerController | null;
}

interface ServiceWorkerStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => ServiceWorkerSnapshot;
  applyUpdate: () => void;
}

/**
 * Declaring the constants
 */
const SERVER_SNAPSHOT: ServiceWorkerSnapshot = { isSupported: false, isRegistered: false, updateAvailable: false, controller: null };

function getServerSnapshot(): ServiceWorkerSnapshot {
  return SERVER_SNAPSHOT;
}

function createServiceWorkerStore(options: RegisterServiceWorkerOptions): ServiceWorkerStore {
  const listeners = new Set<() => void>();
  let snapshot: ServiceWorkerSnapshot = { ...SERVER_SNAPSHOT, isSupported: isServiceWorkerSupported() };
  let started = false;

  const update = (patch: Partial<ServiceWorkerSnapshot>): void => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };

  const start = (): void => {
    if (started) return;
    started = true;
    const controller = registerServiceWorker({
      ...options,
      onRegistered: registration => {
        update({ isRegistered: true });
        options.onRegistered?.(registration);
      },
      onUpdate: updated => {
        update({ updateAvailable: true });
        options.onUpdate?.(updated);
      },
    });
    update({ controller });
  };

  return {
    subscribe: onStoreChange => {
      listeners.add(onStoreChange);
      start();
      return () => void listeners.delete(onStoreChange);
    },
    getSnapshot: () => snapshot,
    applyUpdate: () => {
      snapshot.controller?.applyUpdate();
      update({ updateAvailable: false });
    },
  };
}

/**
 * Register the service worker for the lifetime of the app and expose its update state to React. Registers
 * exactly once, on first subscription (the worker deliberately outlives the component, so there is no
 * unregister on unmount) and flips `updateAvailable` when a new version is waiting so a "refresh to update"
 * prompt can call `applyUpdate`. Registration state is an external store, so the server and hydration render
 * both see the inert snapshot and the real one lands after mount — no hydration mismatch.
 *
 * `options` are read once, when the store is created; later changes are ignored.
 */
export function useServiceWorker(options: RegisterServiceWorkerOptions = {}): UseServiceWorker {
  const [store] = useState(() => createServiceWorkerStore(options));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const applyUpdate = useCallback(() => store.applyUpdate(), [store]);
  return { ...snapshot, applyUpdate };
}
