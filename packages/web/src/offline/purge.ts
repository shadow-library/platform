/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type ServiceWorkerController } from '../pwa/register';
import { deleteDatabase, isIndexedDbAvailable } from './idb';

/**
 * Defining types
 */
export interface PurgeOfflineDataOptions {
  /** IndexedDB databases to delete outright — the app's offline stores (mirror, downloads, query cache). */
  databases?: string[];
  /** Cache Storage caches to delete by exact name. */
  caches?: string[];
  /** Delete every Cache Storage cache whose name starts with one of these prefixes — tolerant of a version suffix. */
  cachePrefixes?: string[];
  /**
   * When set, also asks the active service worker to drop each resolved cache via `delete-cache`. Deleting
   * from the page already clears the shared origin storage, so this is a belt-and-suspenders hop for callers
   * that hold a controller — the purge is complete without it.
   */
  controller?: Pick<ServiceWorkerController, 'message'>;
}

export interface PurgeIfAccountChangedOptions extends PurgeOfflineDataOptions {
  /** localStorage key under which the last-seen account marker lives; overwritten on every change, so it never holds stale cross-account state. */
  storageKey: string;
  /** The signed-in account id, or `null` when signed out — signed-out is its own marked state, distinct from "never seen". */
  accountId: string | null;
}

/**
 * Declaring the constants
 */

/** Delete each named database, guarded: an SSR/unsupported runtime has no IndexedDB, and a database that never opened cannot leak. */
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

/** Explicit names plus every cache matching a prefix — resolved from the live registry so version suffixes are covered. */
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

/**
 * Wipe an app's client-side persisted state: delete its IndexedDB databases, clear the named/prefixed Cache
 * Storage caches, and (when a controller is passed) post the worker's `delete-cache`. Safe to call with
 * nothing stored and in a non-browser/SSR context — every storage access is feature-detected and guarded.
 */
export async function purgeOfflineData(options: PurgeOfflineDataOptions = {}): Promise<void> {
  await deleteDatabases(options.databases ?? []);
  await deleteCaches(options.caches ?? [], options.cachePrefixes ?? [], options.controller);
}

/**
 * Guard an app's offline stores against account bleed on a shared device. When the signed-in account differs
 * from the one last seen here, purge first, then record the new one — so the next user never hydrates the
 * previous user's data. Call it before any account-scoped store hydrates or renders.
 *
 * The first observation on a device is adopted, not purged: pre-existing local data belongs to whoever is
 * signed in now (the owner who was using the device before this guard shipped), and its unsynced writes must
 * survive. Every subsequent change — including signed-in → a different user, or → signed out — purges.
 * Returns whether a purge ran.
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
