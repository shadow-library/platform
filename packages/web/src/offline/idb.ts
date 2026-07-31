/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * A dependency-free promise wrapper over the handful of IndexedDB operations the offline layer needs. Kept
 * deliberately small — a full IDB abstraction is out of scope; this just spares every caller the
 * `onsuccess`/`onerror` event dance and centralizes the open/upgrade logic.
 */
export interface IdbConfig {
  dbName: string;
  storeNames: string[];
  version?: number;
}

/**
 * Declaring the constants
 */
export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Open (and, on first use or a version bump, upgrade) the database, creating any missing object stores. */
export function openDatabase(config: IdbConfig): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(config.dbName, config.version ?? 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of config.storeNames) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(db: IDBDatabase, storeName: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export function idbGet<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return promisify<T | undefined>(store(db, storeName, 'readonly').get(key) as IDBRequest<T | undefined>);
}

export function idbGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return promisify<T[]>(store(db, storeName, 'readonly').getAll() as IDBRequest<T[]>);
}

export async function idbSet(db: IDBDatabase, storeName: string, key: IDBValidKey, value: unknown): Promise<void> {
  await promisify(store(db, storeName, 'readwrite').put(value, key));
}

export async function idbDelete(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  await promisify(store(db, storeName, 'readwrite').delete(key));
}

export async function idbClear(db: IDBDatabase, storeName: string): Promise<void> {
  await promisify(store(db, storeName, 'readwrite').clear());
}
