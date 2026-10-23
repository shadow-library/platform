import { idbClear, type IdbConfig, idbDelete, idbGet, idbGetAll, idbSet, openDatabase } from './idb';

export interface OfflineEntryMeta {
  key: string;
  label?: string;
  /** Approximate stored size in bytes (a `Blob`'s size, else the JSON byte length). */
  size: number;
  downloadedAt: number;
}

export interface OfflineStoreOptions {
  /** IndexedDB database name. @default 'shadow-offline' */
  dbName?: string;
  version?: number;
}

const CONTENT_STORE = 'content';
const META_STORE = 'meta';

function estimateSize(value: unknown): number {
  if (value instanceof Blob) return value.size;
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/** Holds anything structured-cloneable, needs no service worker, and opens lazily so it is safe at module scope under SSR. */
export class OfflineStore {
  private readonly config: IdbConfig;
  private database: Promise<IDBDatabase> | null = null;

  constructor(options: OfflineStoreOptions = {}) {
    this.config = { dbName: options.dbName ?? 'shadow-offline', storeNames: [CONTENT_STORE, META_STORE], version: options.version ?? 1 };
  }

  private db(): Promise<IDBDatabase> {
    return (this.database ??= openDatabase(this.config));
  }

  /** Replaces any existing entry under `key` and returns the recorded metadata. */
  async put<T>(key: string, value: T, meta: { label?: string } = {}): Promise<OfflineEntryMeta> {
    const db = await this.db();
    const entryMeta: OfflineEntryMeta = { key, label: meta.label, size: estimateSize(value), downloadedAt: Date.now() };
    await idbSet(db, CONTENT_STORE, key, value);
    await idbSet(db, META_STORE, key, entryMeta);
    return entryMeta;
  }

  async get<T>(key: string): Promise<T | undefined> {
    return idbGet<T>(await this.db(), CONTENT_STORE, key);
  }

  async has(key: string): Promise<boolean> {
    return (await idbGet<OfflineEntryMeta>(await this.db(), META_STORE, key)) !== undefined;
  }

  async delete(key: string): Promise<void> {
    const db = await this.db();
    await idbDelete(db, CONTENT_STORE, key);
    await idbDelete(db, META_STORE, key);
  }

  async list(): Promise<OfflineEntryMeta[]> {
    return idbGetAll<OfflineEntryMeta>(await this.db(), META_STORE);
  }

  async clear(): Promise<void> {
    const db = await this.db();
    await idbClear(db, CONTENT_STORE);
    await idbClear(db, META_STORE);
  }

  /** Close the open connection so the database can be deleted without an open-handle block; it reopens lazily on next use. */
  close(): void {
    const opening = this.database;
    this.database = null;
    void opening?.then(db => db.close()).catch(() => undefined);
  }

  async totalSize(): Promise<number> {
    return (await this.list()).reduce((sum, entry) => sum + entry.size, 0);
  }

  async estimate(): Promise<{ usage: number; quota: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  }
}
