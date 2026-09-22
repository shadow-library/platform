import { describe, expect, it } from 'bun:test';

import { type AccountMarker, type KeyValueBacking, MemoirStore, SYNC_META_KEYS } from '@/lib/sync';

import { sharedBacking, sharedUnload } from './sync-harness';

interface TestMarker extends AccountMarker {
  value: string | null;
}

function marker(): TestMarker {
  return {
    value: null,
    read(): string | null {
      return this.value;
    },
    write(accountId: string): void {
      this.value = accountId;
    },
    clear(): void {
      this.value = null;
    },
  };
}

function gatedDelete(inner: KeyValueBacking): { backing: KeyValueBacking; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => (release = resolve));
  const backing: KeyValueBacking = {
    get: key => inner.get(key),
    put: (key, value) => inner.put(key, value),
    delete: async key => {
      await gate;
      await inner.delete(key);
    },
    keys: () => inner.keys(),
  };
  return { backing, release };
}

/** A wiped store closes itself, so a fresh instance over the same backing is what proves what actually landed. */
function reopen(backing: KeyValueBacking, accountId: string): MemoirStore {
  const store = new MemoirStore(backing, { accountId });
  store.open();
  return store;
}

describe('MemoirStore wipeAccount', () => {
  it('should delete every key this account owns and leave another account’s keys untouched', async () => {
    const backing = sharedBacking();
    const acctA = new MemoirStore(backing, { accountId: 'acct-a' });
    const acctB = new MemoirStore(backing, { accountId: 'acct-b' });
    acctA.open();
    acctB.open();
    await acctA.upsertRows('quests', [{ id: 'q1' }]);
    await acctB.upsertRows('quests', [{ id: 'q2' }]);

    await acctA.wipeAccount();

    // Reopening a store for acct-a here would re-claim and, via `deleteForeign`, delete acct-b's keys as
    // "foreign" — a real device only ever runs one claimed store at a time, so the raw backing is what a
    // second account's data actually depends on, not a second `MemoirStore` instance.
    const remaining = await backing.keys();
    expect(remaining.some(key => key.startsWith('acct:acct-a:domain:'))).toBe(false);
    expect(await acctB.readDomain('quests')).toEqual([{ id: 'q2' }]);
  });

  it('should drop the outbox and the meta cursor along with the mirror', async () => {
    const backing = sharedBacking();
    const store = new MemoirStore(backing, { accountId: 'acct-a' });
    store.open();
    await store.upsertRows('quests', [{ id: 'q1' }]);
    await store.appendOutbox({
      commandId: 'cmd-1',
      type: 'quest.complete',
      payload: {},
      localDate: '2026-08-01',
      seq: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      command: { type: 'quest.complete', questId: 'q1' } as never,
    });
    await store.writeMeta('cursor', '9');

    await store.wipeAccount();

    const verify = reopen(backing, 'acct-a');
    expect(await verify.readOutbox()).toEqual([]);
    expect(await verify.readMeta('cursor')).toBeUndefined();
  });

  it('should keep the device id so sign-out does not register a new device on the next sign-in', async () => {
    const backing = sharedBacking();
    const store = new MemoirStore(backing, { accountId: 'acct-a' });
    store.open();
    await store.writeMeta('device-id', 'dev-1');

    await store.wipeAccount();

    expect(await reopen(backing, 'acct-a').readMeta('device-id')).toBe('dev-1');
  });

  it('should forget the last-account marker only when it still points at this account', async () => {
    const backing = sharedBacking();
    const m = marker();
    const store = new MemoirStore(backing, { accountId: 'acct-a', marker: m });
    store.open();
    await store.upsertRows('quests', [{ id: 'q1' }]);
    expect(m.value).toBe('acct-a');

    await store.wipeAccount();
    expect(m.value).toBeNull();
  });

  it('should refuse to wipe, leaving a newer sign-in’s marker claim alone, once another tab owns the store', async () => {
    const backing = sharedBacking();
    const m = marker();
    const store = new MemoirStore(backing, { accountId: 'acct-a', marker: m });
    store.open();
    await store.upsertRows('quests', [{ id: 'q1' }]);
    m.write('acct-b');

    await expect(store.wipeAccount()).rejects.toThrow('now belongs to another account');
    expect(m.value).toBe('acct-b');
  });

  it('should refuse a read or write on the same store both during and after a successful wipe', async () => {
    const { backing, release } = gatedDelete(sharedBacking());
    const store = new MemoirStore(backing, { accountId: 'acct-a' });
    store.open();
    await store.upsertRows('quests', [{ id: 'q1' }]);

    const wiping = store.wipeAccount();
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(store.upsertRows('quests', [{ id: 'q2' }])).rejects.toThrow('The local store was closed.');

    release();
    await wiping;
    await expect(store.upsertRows('quests', [{ id: 'q2' }])).rejects.toThrow('The local store was closed.');
  });

  it('should not need to close the database first, unlike a whole-database delete blocked on another tab’s connection', async () => {
    const backing = sharedBacking();
    const tabA = new MemoirStore(backing, { accountId: 'acct-a' });
    const tabB = new MemoirStore(backing, { accountId: 'acct-a' });
    tabA.open();
    tabB.open();
    await tabA.upsertRows('quests', [{ id: 'q1' }]);

    await tabA.wipeAccount();

    expect(await tabB.readDomain('quests')).toEqual([]);
  });
});

describe('MemoirStore unload copies', () => {
  const DRAFT = SYNC_META_KEYS.journalDraft;

  it('should remove this account’s copy when the account is wiped', async () => {
    const unload = sharedUnload();
    const owner = marker();
    const store = new MemoirStore(sharedBacking(), { accountId: 'acct-a', marker: owner, unload });
    store.open();
    await store.readMeta(DRAFT);
    store.writeUnloadMeta(DRAFT, { text: 'private' });

    await store.wipeAccount();

    expect(unload.keys()).toEqual([]);
  });

  it('should remove the copy even when the wipe cannot reach IndexedDB', async () => {
    const unload = sharedUnload();
    const owner = marker();
    const backing = sharedBacking();
    const store = new MemoirStore(backing, { accountId: 'acct-a', marker: owner, unload });
    store.open();
    await store.readMeta(DRAFT);
    store.writeUnloadMeta(DRAFT, { text: 'private' });
    const broken = new MemoirStore({ ...backing, keys: () => Promise.reject(new TypeError('storage unavailable')) }, { accountId: 'acct-a', marker: owner, unload });
    broken.open();

    await expect(broken.wipeAccount()).rejects.toThrow('storage unavailable');
    expect(unload.keys()).toEqual([]);
  });

  it('should remove another account’s copy when this account claims the store', async () => {
    const unload = sharedUnload();
    const owner = marker();
    const backing = sharedBacking();
    const previous = new MemoirStore(backing, { accountId: 'acct-a', marker: owner, unload });
    previous.open();
    await previous.readMeta(DRAFT);
    previous.writeUnloadMeta(DRAFT, { text: 'private' });

    const next = new MemoirStore(backing, { accountId: 'acct-b', marker: owner, unload });
    next.open();
    await next.readMeta(DRAFT);

    expect(unload.keys()).toEqual([]);
  });

  it('should refuse a stale tab’s copy after another tab switches account', async () => {
    const unload = sharedUnload();
    const owner = marker();
    const backing = sharedBacking();
    const stale = new MemoirStore(backing, { accountId: 'acct-a', marker: owner, unload });
    stale.open();
    await stale.readMeta(DRAFT);
    const next = new MemoirStore(backing, { accountId: 'acct-b', marker: owner, unload });
    next.open();
    await next.readMeta(DRAFT);

    stale.writeUnloadMeta(DRAFT, { text: 'late' });

    expect(unload.keys()).toEqual([]);
    expect(stale.readUnloadMeta(DRAFT)).toBeNull();
  });

  it('should refuse a stale tab’s copy after another tab signs the same account out', async () => {
    const unload = sharedUnload();
    const owner = marker();
    const backing = sharedBacking();
    const stale = new MemoirStore(backing, { accountId: 'acct-a', marker: owner, unload });
    const signingOut = new MemoirStore(backing, { accountId: 'acct-a', marker: owner, unload });
    stale.open();
    signingOut.open();
    await stale.readMeta(DRAFT);
    await signingOut.readMeta(DRAFT);

    await signingOut.wipeAccount();
    stale.writeUnloadMeta(DRAFT, { text: 'after sign-out' });

    expect(unload.keys()).toEqual([]);
  });
});
