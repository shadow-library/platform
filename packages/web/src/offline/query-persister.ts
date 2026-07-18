/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type IdbConfig, idbDelete, idbGet, idbSet, isIndexedDbAvailable, openDatabase } from './idb';

/**
 * Defining types
 *
 * `PersistedClient`/`Persister` mirror the (stable) contract from `@tanstack/query-persist-client-core`,
 * declared locally so this helper adds no extra peer dependency. The returned object is structurally
 * compatible with `persistQueryClient({ persister })`.
 */
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

/**
 * Declaring the constants
 */
const STORE_NAME = 'query-cache';

/**
 * An IndexedDB persister for the TanStack Query cache, so query results survive reloads and are readable
 * offline. Wire it with `@tanstack/react-query-persist-client`'s `PersistQueryClientProvider` (or
 * `persistQueryClient`). No-ops safely when IndexedDB is unavailable (SSR), so it can be created unconditionally.
 *
 * This persists the *whole* cache; for selecting specific content to keep offline, use {@link OfflineStore}.
 */
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
