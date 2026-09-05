/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type SwRequest } from '../pwa/protocol';
import { purgeIfAccountChanged, purgeOfflineData } from './purge';

/**
 * Declaring the constants
 *
 * In-memory fakes for the IndexedDB, Cache Storage and localStorage the purge touches — Bun's test runtime
 * ships none of them, so the globals are stubbed to record what the purge deletes without a browser.
 */
const deletedDbs: string[] = [];
const fakeIndexedDb = {
  deleteDatabase(name: string): IDBOpenDBRequest {
    deletedDbs.push(name);
    const request = { onsuccess: null, onerror: null, onblocked: null } as unknown as IDBOpenDBRequest;
    queueMicrotask(() => request.onsuccess?.(new Event('success')));
    return request;
  },
};

let cacheNames: string[] = [];
const deletedCaches: string[] = [];
const fakeCaches = {
  keys: async (): Promise<string[]> => [...cacheNames],
  delete: async (name: string): Promise<boolean> => {
    deletedCaches.push(name);
    const had = cacheNames.includes(name);
    cacheNames = cacheNames.filter(candidate => candidate !== name);
    return had;
  },
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

const sentMessages: SwRequest[] = [];
const controller = {
  message: async (request: SwRequest) => {
    sentMessages.push(request);
    return { type: 'done' } as const;
  },
};

beforeEach(() => {
  deletedDbs.length = 0;
  deletedCaches.length = 0;
  sentMessages.length = 0;
  cacheNames = ['webnovel-precache-v1', 'webnovel-runtime-v1', 'webnovel-offline', 'unrelated'];
  (globalThis as { indexedDB: unknown }).indexedDB = fakeIndexedDb;
  (globalThis as { caches: unknown }).caches = fakeCaches;
  (globalThis as { localStorage: unknown }).localStorage = memoryStorage();
});

describe('purgeOfflineData', () => {
  it('should delete the named databases and only the caches matching a name or prefix', async () => {
    await purgeOfflineData({ databases: ['webnovel-offline'], cachePrefixes: ['webnovel-runtime', 'webnovel-offline'] });

    expect(deletedDbs).toEqual(['webnovel-offline']);
    expect(deletedCaches).toContain('webnovel-runtime-v1');
    expect(deletedCaches).toContain('webnovel-offline');
    expect(deletedCaches).not.toContain('webnovel-precache-v1');
    expect(deletedCaches).not.toContain('unrelated');
  });

  it('should post the worker delete-cache message for each resolved cache when a controller is given', async () => {
    await purgeOfflineData({ cachePrefixes: ['webnovel-runtime'], controller });

    expect(sentMessages).toEqual([{ type: 'delete-cache', cacheName: 'webnovel-runtime-v1' }]);
  });

  it('should be a safe no-op with nothing to purge', async () => {
    await purgeOfflineData();
    expect(deletedDbs).toEqual([]);
    expect(deletedCaches).toEqual([]);
  });

  it('should not throw in a runtime without IndexedDB or Cache Storage', async () => {
    (globalThis as { indexedDB: unknown }).indexedDB = undefined;
    (globalThis as { caches: unknown }).caches = undefined;

    await purgeOfflineData({ databases: ['webnovel-offline'], cachePrefixes: ['webnovel-runtime'] });
    expect(deletedDbs).toEqual([]);
    expect(deletedCaches).toEqual([]);
  });
});

describe('purgeIfAccountChanged', () => {
  it('should adopt the first account it sees without purging', async () => {
    const purged = await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_A', databases: ['app-db'] });

    expect(purged).toBe(false);
    expect(deletedDbs).toEqual([]);
    expect(localStorage.getItem('app:last-account')).toBe('usr_A');
  });

  it('should purge and re-record when a different account signs in', async () => {
    await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_A', databases: ['app-db'] });
    const purged = await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_B', databases: ['app-db'] });

    expect(purged).toBe(true);
    expect(deletedDbs).toEqual(['app-db']);
    expect(localStorage.getItem('app:last-account')).toBe('usr_B');
  });

  it('should treat signing out as its own state and purge when it follows a signed-in account', async () => {
    await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_A', databases: ['app-db'] });
    const purged = await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: null, databases: ['app-db'] });

    expect(purged).toBe(true);
    expect(deletedDbs).toEqual(['app-db']);
    expect(localStorage.getItem('app:last-account')).toBe('');
  });

  it('should do nothing when the account is unchanged', async () => {
    await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_A', databases: ['app-db'] });
    const purged = await purgeIfAccountChanged({ storageKey: 'app:last-account', accountId: 'usr_A', databases: ['app-db'] });

    expect(purged).toBe(false);
    expect(deletedDbs).toEqual([]);
  });
});
