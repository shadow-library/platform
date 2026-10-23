import { type ServiceWorkerController } from '../pwa/register';
import { deleteDatabase, isIndexedDbAvailable } from './idb';

export interface PurgeOfflineDataOptions {
  /** IndexedDB databases to delete outright — the app's offline stores (mirror, downloads, query cache). */
  databases?: string[];
  /** Cache Storage caches to delete by exact name. */
  caches?: string[];
  /** Delete every Cache Storage cache whose name starts with one of these prefixes — tolerant of a version suffix. */
  cachePrefixes?: string[];
  /** When set, also asks the active service worker to drop each resolved cache via `delete-cache`; the page-side delete already clears shared storage, so this is optional. */
  controller?: Pick<ServiceWorkerController, 'message'>;
}

export interface PurgeIfAccountChangedOptions extends PurgeOfflineDataOptions {
  /** localStorage key holding the last-seen account marker. */
  storageKey: string;
  /** The signed-in account id, or `null` when signed out, which is a marked state distinct from "never seen". */
  accountId: string | null;
}

async function deleteDatabases(names: string[]): Promise<void> {
  if (!names.length || !isIndexedDbAvailable()) return;
  for (const name of names) {
    try {
      await deleteDatabase(name);
    } catch {
      /* a delete that fails is not worth surfacing on a sign-out; the account-change guard purges again on next boot */
    }
  }
}

async function resolveCacheNames(names: string[], prefixes: string[]): Promise<string[]> {
  const resolved = new Set(names);
  if (prefixes.length) {
    const keys = await caches.keys();
    for (const key of keys) if (prefixes.some(prefix => key.startsWith(prefix))) resolved.add(key);
  }
  return [...resolved];
}

async function deleteCaches(names: string[], prefixes: string[], controller: PurgeOfflineDataOptions['controller']): Promise<void> {
  if ((!names.length && !prefixes.length) || typeof caches === 'undefined') return;
  let targets: string[];
  try {
    targets = await resolveCacheNames(names, prefixes);
  } catch {
    return;
  }
  for (const name of targets) {
    try {
      await caches.delete(name);
    } catch {
      /* the cache may already be gone */
    }
    if (!controller) continue;
    try {
      await controller.message({ type: 'delete-cache', cacheName: name });
    } catch {
      /* no controlling worker to receive it — the page-side delete above already cleared the shared storage */
    }
  }
}

function readMarker(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeMarker(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — a lost marker only costs one extra (harmless) purge next boot */
  }
}

/** Safe with nothing stored and in SSR: every storage access is feature-detected and guarded. */
export async function purgeOfflineData(options: PurgeOfflineDataOptions = {}): Promise<void> {
  await deleteDatabases(options.databases ?? []);
  await deleteCaches(options.caches ?? [], options.cachePrefixes ?? [], options.controller);
}

/**
 * Purges when the signed-in account differs from the one last seen on this device, then records it; call before any account-scoped store hydrates.
 * The first observation is adopted, not purged, so unsynced writes from before the guard shipped survive. Returns whether a purge ran.
 */
export async function purgeIfAccountChanged(options: PurgeIfAccountChangedOptions): Promise<boolean> {
  const { storageKey, accountId, ...purge } = options;
  const previous = readMarker(storageKey);
  const current = accountId ?? '';
  if (previous === current) return false;

  const changed = previous !== null;
  if (changed) await purgeOfflineData(purge);
  writeMarker(storageKey, current);
  return changed;
}
