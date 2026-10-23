import { type IdbConfig, idbDelete, idbGet, idbSet, isIndexedDbAvailable, openDatabase } from './idb';

// Mirrors `@tanstack/query-persist-client-core`'s contract so this helper adds no peer dependency.

export interface PersistedClient {
  timestamp: number;
  buster: string;
  clientState: unknown;
}

export interface Persister {
  persistClient(client: PersistedClient): Promise<void>;
  restoreClient(): Promise<PersistedClient | undefined>;
  removeClient(): Promise<void>;
}

export interface IDBPersisterOptions {
  /** IndexedDB database name. @default 'shadow-query-cache' */
  dbName?: string;
  /** Key the dehydrated client is stored under. @default 'query-client' */
  key?: string;
}

const STORE_NAME = 'query-cache';

/** Persists the *whole* query cache (no-ops without IndexedDB, so safe under SSR); to keep specific content offline use {@link OfflineStore}. */
export function createIDBPersister(options: IDBPersisterOptions = {}): Persister {
  const config: IdbConfig = { dbName: options.dbName ?? 'shadow-query-cache', storeNames: [STORE_NAME], version: 1 };
  const key = options.key ?? 'query-client';

  return {
    async persistClient(client) {
      if (!isIndexedDbAvailable()) return;
      await idbSet(await openDatabase(config), STORE_NAME, key, client);
    },
    async restoreClient() {
      if (!isIndexedDbAvailable()) return undefined;
      return idbGet<PersistedClient>(await openDatabase(config), STORE_NAME, key);
    },
    async removeClient() {
      if (!isIndexedDbAvailable()) return;
      await idbDelete(await openDatabase(config), STORE_NAME, key);
    },
  };
}
