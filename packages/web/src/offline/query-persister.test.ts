import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { createIDBPersister, type PersistedClient } from './query-persister';

interface FakeConnection {
  open: boolean;
  onversionchange: (() => void) | null;
  onclose: (() => void) | null;
}

// Bun's test runtime ships no IndexedDB, so a minimal in-memory one records each `open` and the connections it hands out.
let connections: FakeConnection[] = [];
let failNextOpen = false;
const rows = new Map<string, unknown>();

function settle<T>(result: () => T): IDBRequest<T> {
  const request = { onsuccess: null, onerror: null } as unknown as IDBRequest<T> & { result: T };
  queueMicrotask(() => {
    request.result = result();
    request.onsuccess?.(new Event('success'));
  });
  return request;
}

function connect(): IDBDatabase {
  const connection: FakeConnection = { open: true, onversionchange: null, onclose: null };
  connections.push(connection);
  const store = {
    put: (value: unknown, key: string) => settle(() => void rows.set(key, value)),
    get: (key: string) => settle(() => rows.get(key)),
    delete: (key: string) => settle(() => void rows.delete(key)),
  };
  return Object.assign(connection, {
    objectStoreNames: { contains: () => true },
    transaction: () => ({ objectStore: () => store }),
    close: () => void (connection.open = false),
  }) as unknown as IDBDatabase;
}

const fakeIndexedDb = {
  open(): IDBOpenDBRequest {
    const request = { onsuccess: null, onerror: null, onupgradeneeded: null } as unknown as IDBOpenDBRequest & { result: IDBDatabase; error: DOMException };
    queueMicrotask(() => {
      if (failNextOpen) {
        failNextOpen = false;
        request.error = new DOMException('open failed', 'UnknownError');
        request.onerror?.(new Event('error'));
        return;
      }
      request.result = connect();
      request.onsuccess?.(new Event('success'));
    });
    return request;
  },
};

const snapshot = (timestamp: number): PersistedClient => ({ timestamp, buster: '', clientState: { queries: [] } });

beforeEach(() => {
  connections = [];
  failNextOpen = false;
  rows.clear();
  (globalThis as { indexedDB?: unknown }).indexedDB = fakeIndexedDb;
});

afterEach(() => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
});

describe('createIDBPersister', () => {
  it('should reuse one connection across every save, restore and remove', async () => {
    const persister = createIDBPersister();

    await Promise.all([persister.persistClient(snapshot(1)), persister.persistClient(snapshot(2)), persister.persistClient(snapshot(3))]);
    const restored = await persister.restoreClient();
    await persister.removeClient();

    expect(restored?.timestamp).toBe(3);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.open).toBe(true);
  });

  it('should close its connection for a database delete and reopen on next use', async () => {
    const persister = createIDBPersister();
    await persister.persistClient(snapshot(1));

    connections[0]?.onversionchange?.();
    await persister.persistClient(snapshot(2));

    expect(connections.map(connection => connection.open)).toEqual([false, true]);
  });

  it('should retry opening after a failed open', async () => {
    const persister = createIDBPersister();
    failNextOpen = true;

    const error = await persister.persistClient(snapshot(1)).catch((caught: unknown) => caught);
    await persister.persistClient(snapshot(2));

    expect((error as Error).message).toBe('open failed');
    expect(connections).toHaveLength(1);
    expect((await persister.restoreClient())?.timestamp).toBe(2);
  });
});
