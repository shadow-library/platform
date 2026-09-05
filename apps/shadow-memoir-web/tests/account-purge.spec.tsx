import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncEngineProvider } from '@/lib/sync';

import { createSyncedTestData, createTestEngine } from './sync-harness';

/**
 * HIGH-009: a handed-on device must not render the previous owner's finance/journal/health data. The mirror
 * lives in the `shadow-memoir` IndexedDB database; on an account change the boot must delete it before the
 * engine hydrates. jsdom ships no IndexedDB, so a `deleteDatabase`-recording stub stands in — the ordering it
 * captures (delete before hydrate) is the guarantee, and `@shadow-library/web`'s own suite proves the delete
 * actually empties the store.
 */
const LAST_ACCOUNT_KEY = 'shadow-memoir:last-account';

let events: string[] = [];

function installFakeIndexedDb(): void {
  const fake = {
    deleteDatabase(name: string): IDBOpenDBRequest {
      events.push(`delete:${name}`);
      const request = { onsuccess: null, onerror: null, onblocked: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.(new Event('success')));
      return request;
    },
  };
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: fake });
}

beforeEach(() => {
  events = [];
  window.localStorage.clear();
  installFakeIndexedDb();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('account-change purge', () => {
  it('should adopt the first account it sees without deleting the store', async () => {
    const { engine } = createTestEngine();
    const start = vi.spyOn(engine, 'start');
    const data = createSyncedTestData(engine);

    render(
      <SyncEngineProvider data={data} accountId="usr_A">
        {null}
      </SyncEngineProvider>,
    );

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(events.filter(event => event.startsWith('delete:'))).toEqual([]);
    expect(window.localStorage.getItem(LAST_ACCOUNT_KEY)).toBe('usr_A');
  });

  it('should delete the previous account’s database before the engine hydrates', async () => {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, 'usr_A');
    const { engine } = createTestEngine();
    const realStart = engine.start.bind(engine);
    vi.spyOn(engine, 'start').mockImplementation(async () => {
      events.push('hydrate');
      return realStart();
    });
    const data = createSyncedTestData(engine);

    render(
      <SyncEngineProvider data={data} accountId="usr_B">
        {null}
      </SyncEngineProvider>,
    );

    await waitFor(() => expect(events).toContain('hydrate'));
    expect(events).toEqual(['delete:shadow-memoir', 'hydrate']);
    expect(window.localStorage.getItem(LAST_ACCOUNT_KEY)).toBe('usr_B');
  });

  it('should not touch the store when the same account returns', async () => {
    window.localStorage.setItem(LAST_ACCOUNT_KEY, 'usr_A');
    const { engine } = createTestEngine();
    const start = vi.spyOn(engine, 'start');
    const data = createSyncedTestData(engine);

    render(
      <SyncEngineProvider data={data} accountId="usr_A">
        {null}
      </SyncEngineProvider>,
    );

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(events.filter(event => event.startsWith('delete:'))).toEqual([]);
  });
});
