import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'bun:test';
import { purgeIfAccountChanged } from '@shadow-library/web/offline';

import { getProgress, purgeOnLogout, saveProgress } from '@/lib/apis';
import { OFFLINE_DB_NAME, PURGE_CACHE_PREFIXES } from '@/lib/offline';

/**
 * WNW-04 / HIGH-009: a shared device must not carry one reader's downloads or gated-chapter cache to the
 * next. The test runtime ships no IndexedDB, Cache Storage or localStorage, so in-memory stubs stand in and
 * record what the purge deletes. The precache (app shell) must survive — clearing it would break offline
 * navigation for everyone.
 */
let deletedDbs: string[] = [];
let cacheNames: string[] = [];
let deletedCaches: string[] = [];

function successRequest(result?: unknown): IDBRequest {
  const request = { result, onsuccess: null, onerror: null } as unknown as { result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };
  queueMicrotask(() => request.onsuccess?.());
  return request as unknown as IDBRequest;
}

const objectStore = {
  get: () => successRequest(undefined),
  getAll: () => successRequest([]),
  put: () => successRequest(undefined),
  delete: () => successRequest(undefined),
  clear: () => successRequest(undefined),
};

const database = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => objectStore,
  transaction: () => ({ objectStore: () => objectStore }),
  close: () => undefined,
};

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  } as unknown as Storage;
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
}

function installFakeIndexedDb(): void {
  deletedDbs = [];
  const fake = {
    open(): IDBOpenDBRequest {
      const request = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null } as unknown as {
        result: unknown;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request as unknown as IDBOpenDBRequest;
    },
    deleteDatabase(name: string): IDBOpenDBRequest {
      deletedDbs.push(name);
      const request = { onsuccess: null, onerror: null, onblocked: null } as unknown as {
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
      };
      queueMicrotask(() => request.onsuccess?.());
      return request as unknown as IDBOpenDBRequest;
    },
  };
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: fake });
}

function installFakeCaches(names: string[]): void {
  cacheNames = [...names];
  deletedCaches = [];
  const fake = {
    keys: async () => [...cacheNames],
    delete: async (name: string) => {
      deletedCaches.push(name);
      const had = cacheNames.includes(name);
      cacheNames = cacheNames.filter(candidate => candidate !== name);
      return had;
    },
  };
  Object.defineProperty(window, 'caches', { configurable: true, value: fake });
}

beforeEach(() => {
  installMemoryStorage();
  installFakeIndexedDb();
  installFakeCaches(['webnovel-precache-v1', 'webnovel-runtime-v1', 'webnovel-offline', 'unrelated']);
});

describe('purgeOnLogout', () => {
  it('should delete the downloaded-content store and the gated-chapter cache while keeping the app shell', async () => {
    saveProgress('starfall-requiem', 5, 40, 'usr_A');
    saveProgress('omniscient-sovereigns', 2, 10, 'usr_B');

    await purgeOnLogout(new QueryClient(), 'usr_A');

    expect(deletedDbs).toContain(OFFLINE_DB_NAME);
    expect(deletedCaches).toContain('webnovel-runtime-v1');
    expect(deletedCaches).toContain('webnovel-offline');
    expect(deletedCaches).not.toContain('webnovel-precache-v1');
    expect(deletedCaches).not.toContain('unrelated');
    expect(getProgress('starfall-requiem', 'usr_A')).toBeUndefined();
    expect(getProgress('omniscient-sovereigns', 'usr_B')?.ordinal).toBe(2);
  });
});

describe('account-change purge', () => {
  it('should adopt the first reader, then purge the offline store when a different reader signs in', async () => {
    const adopted = await purgeIfAccountChanged({
      storageKey: 'webnovel:last-account',
      accountId: 'usr_A',
      databases: [OFFLINE_DB_NAME],
      cachePrefixes: [...PURGE_CACHE_PREFIXES],
    });
    expect(adopted).toBe(false);
    expect(deletedDbs).toEqual([]);

    const purged = await purgeIfAccountChanged({ storageKey: 'webnovel:last-account', accountId: 'usr_B', databases: [OFFLINE_DB_NAME], cachePrefixes: [...PURGE_CACHE_PREFIXES] });
    expect(purged).toBe(true);
    expect(deletedDbs).toContain(OFFLINE_DB_NAME);
    expect(deletedCaches).toContain('webnovel-runtime-v1');
    expect(deletedCaches).not.toContain('webnovel-precache-v1');
  });
});
