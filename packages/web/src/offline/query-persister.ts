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
  let database: Promise<IDBDatabase> | null = null;

  // `persistQueryClient` saves on every cache event without throttling, so one connection is reused; it yields to a `deleteDatabase` (a purge) and reopens on next use.
  const db = (): Promise<IDBDatabase> =>
    (database ??= openDatabase(config).then(
      connection => {
        const release = (): void => {
          connection.close();
          database = null;
        };
        connection.onversionchange = release;
        connection.onclose = release;
        return connection;
      },
      (error: unknown) => {
        database = null;
        throw error;
      },
    ));

  return {
    async persistClient(client) {
      if (!isIndexedDbAvailable()) return;
      await idbSet(await db(), STORE_NAME, key, client);
    },
    async restoreClient() {
      if (!isIndexedDbAvailable()) return undefined;
      return idbGet<PersistedClient>(await db(), STORE_NAME, key);
    },
    async removeClient() {
      if (!isIndexedDbAvailable()) return;
      await idbDelete(await db(), STORE_NAME, key);
    },
  };
}
