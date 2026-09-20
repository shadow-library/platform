import { useSyncExternalStore } from 'react';
import { isServiceWorkerSupported, registerServiceWorker, type ServiceWorkerController } from '@shadow-library/web/pwa';

/** `next-load`: a worker is registered, but this load was not served through it, so the assets it needs to open offline are not cached yet. */
export type OfflineReadiness = 'unavailable' | 'next-load' | 'ready';

export type UpdateStatus = 'none' | 'waiting' | 'applying';

export interface AppUpdateState {
  offline: OfflineReadiness;
  update: UpdateStatus;
}

export interface AppUpdate extends AppUpdateState {
  /** Activates the waiting worker; the page reloads once it takes control. */
  apply: () => void;
}

const SERVICE_WORKER_URL = '/sw.js';

const APPLY_TIMEOUT_MS = 10_000;

const SERVER_STATE: AppUpdateState = { offline: 'unavailable', update: 'none' };

const listeners = new Set<() => void>();

let state: AppUpdateState = SERVER_STATE;

let controller: ServiceWorkerController | null = null;

let controlledAtLoad = false;

let controllerAtUpdate: ServiceWorker | null = null;

function setState(patch: Partial<AppUpdateState>): void {
  const next = { ...state, ...patch };
  if (next.offline === state.offline && next.update === state.update) return;
  state = next;
  for (const listener of listeners) listener();
}

function onUpdate(): void {
  controllerAtUpdate = navigator.serviceWorker.controller;
  setState({ update: 'waiting' });
}

function register(): void {
  if (controller || !import.meta.env.PROD || !isServiceWorkerSupported()) return;
  controlledAtLoad = navigator.serviceWorker.controller !== null;
  controller = registerServiceWorker({ url: SERVICE_WORKER_URL, onRegistered: () => setState({ offline: controlledAtLoad ? 'ready' : 'next-load' }), onUpdate });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  register();
  return () => void listeners.delete(listener);
}

function getState(): AppUpdateState {
  return state;
}

function getServerState(): AppUpdateState {
  return SERVER_STATE;
}

function apply(): void {
  if (state.update !== 'waiting' || !controller) return;
  if (!controller.registration?.waiting) {
    if (navigator.serviceWorker.controller !== controllerAtUpdate) return window.location.reload();
    return setState({ update: 'none' });
  }
  setState({ update: 'applying' });
  controller.applyUpdate();
  setTimeout(() => state.update === 'applying' && setState({ update: 'waiting' }), APPLY_TIMEOUT_MS);
}

/** One registration for the whole app: `useServiceWorker` registers once per calling component, and the banner, the update sheet and App and sync all need the same answer. */
export function useAppUpdate(): AppUpdate {
  return { ...useSyncExternalStore(subscribe, getState, getServerState), apply };
}
