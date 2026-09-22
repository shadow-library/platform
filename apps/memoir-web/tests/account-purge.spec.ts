import { beforeEach, describe, expect, it } from 'bun:test';

import { type Command } from '@/lib/data';
import { type AccountMarker, type DeltaPage, type FetchLike, type KeyValueBacking, MemoirStore, SYNC_META_KEYS, type SyncEngine } from '@/lib/sync';

import { createSyncedTestData, createTestEngine, type FakeServer, sharedBacking, sharedMarker, type TestEngine, type TestEngineOptions } from './sync-harness';

/** One backing under several stores stands in for the single IndexedDB database every tab and account shares. */
const TODAY = '2026-08-24';
const COMPLETE: Command = { type: 'quest.complete', occurrenceId: `q1:${TODAY}` };

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '1', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

function questRow(id: string): Record<string, unknown> {
  return { id, name: `Quest ${id}`, active: true, syncSeq: id };
}

function dailyQuestRow(id: string): Record<string, unknown> {
  return {
    id,
    name: `Quest ${id}`,
    notes: null,
    startTimeMin: 420,
    durationMin: 30,
    statAffinity: 'body',
    strictness: 'routine',
    optionalStreakOptIn: false,
    recurrence: { frequency: 'daily', interval: 1, startDate: '2026-08-01', end: { kind: 'never' }, exceptions: [] },
    moduleLink: null,
    reminderEnabled: false,
    reminderLeadMin: 0,
    healthThreshold: null,
    active: true,
    syncSeq: id,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function expenseRow(id: string): Record<string, unknown> {
  return { id, amountMinor: 100, currency: 'EUR', categoryKey: 'food', occurredOn: TODAY, loggedAt: `${TODAY}T09:00:00.000Z`, source: 'manual' };
}

interface Pause {
  reached: Promise<void>;
  release: () => void;
}

function pause(): Pause & { wait: () => Promise<void>; reach: () => void } {
  let reach = (): void => undefined;
  let release = (): void => undefined;
  const reached = new Promise<void>(resolve => (reach = resolve));
  const released = new Promise<void>(resolve => (release = resolve));
  return { reached, release, reach, wait: () => released };
}

function gateOn(path: string): Pause & { fetchImpl: (server: FakeServer) => FetchLike } {
  const gate = pause();
  const fetchImpl =
    (server: FakeServer): FetchLike =>
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes(path)) {
        gate.reach();
        await gate.wait();
      }
      return server.fetchImpl(input, init);
    };
  return { ...gate, fetchImpl };
}

/** Holds the first matching put mid-write, so another tab can claim the store between an ownership check and the write it guarded. */
function pausedPut(backing: KeyValueBacking, match: string): Pause & { backing: KeyValueBacking } {
  const gate = pause();
  let held = false;
  const put = async (key: string, value: unknown): Promise<void> => {
    if (!held && key.includes(match)) {
      held = true;
      gate.reach();
      await gate.wait();
    }
    return backing.put(key, value);
  };
  return { ...gate, backing: { ...backing, put } };
}

function spied(backing: KeyValueBacking, reads: string[]): KeyValueBacking {
  return { ...backing, get: key => (reads.push(key), backing.get(key)), keys: () => (reads.push('*'), backing.keys()) };
}

async function queuedOffline(engine: SyncEngine): Promise<string> {
  setOnline(false);
  await engine.enqueue(COMPLETE, TODAY);
  setOnline(true);
  const [entry] = await engine.outbox.pending();
  return entry?.commandId as string;
}

function engineFor(accountId: string, backing: KeyValueBacking, marker: AccountMarker, options: TestEngineOptions = {}): TestEngine {
  return createTestEngine({ backing, marker, accountId, today: TODAY, ...options });
}

async function accountA(backing: KeyValueBacking, marker: AccountMarker): Promise<TestEngine & { commandId: string }> {
  const a = engineFor('usr_A', backing, marker, { pages: [page({ cursor: '7', domains: { quests: [questRow('a1')] } })] });
  await a.engine.start();
  const commandId = await queuedOffline(a.engine);
  return { ...a, commandId };
}

async function expectNothingOf(store: MemoirStore): Promise<void> {
  expect(await store.readOutbox()).toEqual([]);
  expect(await store.readDomain('quests')).toEqual([]);
  expect(await store.readDomain('expenses')).toEqual([]);
  expect(await store.readMeta(SYNC_META_KEYS.cursor)).not.toBe('7');
  expect(await store.readMeta(SYNC_META_KEYS.weeklyReview)).toBeUndefined();
}

async function keysOf(backing: KeyValueBacking, accountId: string): Promise<string[]> {
  return (await backing.keys()).filter(key => key.startsWith(`acct:${accountId}:`));
}

beforeEach(() => setOnline(true));

describe('account-change isolation', () => {
  it('should clear the outbox when the account changes', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = await accountA(backing, marker);
    await a.store.writeMeta(SYNC_META_KEYS.weeklyReview, { answers: { win: 'A private answer' }, complete: false });
    await a.store.writeMeta(SYNC_META_KEYS.deletionPending, true);
    expect(await a.store.readOutbox()).toHaveLength(1);
    a.engine.stop();

    const b = engineFor('usr_B', backing, marker);
    await b.engine.start();

    await expectNothingOf(b.store);
    expect(await b.store.readMeta(SYNC_META_KEYS.deletionPending)).toBeUndefined();
    expect(b.engine.getSnapshot().queuedCount).toBe(0);
    expect(await keysOf(backing, 'usr_A')).toEqual([]);
  });

  it("should not replay a previous account's command after purge", async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = await accountA(backing, marker);
    const b = engineFor('usr_B', backing, marker);

    // The original exercised this switch through `<SyncEngineProvider>`'s effect (mount on A's data,
    // rerender onto B's), which cleans up A (`engine.stop()`) then starts B — exactly what it does
    // directly, and the purge invariant lives in the engine/store, not the provider's effect wiring.
    a.engine.stop();
    await b.engine.start();

    expect(b.engine.getSnapshot().state).toBe('online');
    expect(b.server.batches).toEqual([]);
    expect(await b.store.readOutbox()).toEqual([]);
  });

  it('should read nothing from the store before the engine opens it', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    await accountA(backing, marker);
    const reads: string[] = [];
    const b = engineFor('usr_B', spied(backing, reads), marker);

    createSyncedTestData(b.engine);
    await new Promise(resolve => setImmediate(resolve));
    expect(reads).toEqual([]);

    await b.engine.start();
    await expectNothingOf(b.store);
  });

  it('should keep the queue and replay it when the same account signs back in', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = await accountA(backing, marker);
    a.engine.stop();

    const again = engineFor('usr_A', backing, marker);
    await again.engine.start();

    expect(again.server.batches.flatMap(batch => batch.commandIds)).toEqual([a.commandId]);
    expect(await again.store.readDomain('quests')).toHaveLength(1);
  });

  it('should stop a flush in flight from settling into the next account’s store', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = await accountA(backing, marker);
    a.engine.stop();
    const gate = gateOn('/sync/commands');
    const resumed = engineFor('usr_A', backing, marker, { fetchImpl: gate.fetchImpl, pages: [page({ cursor: '9', domains: { quests: [questRow('a2')] } })] });
    const pass = resumed.engine.start();
    await gate.reached;

    resumed.engine.stop();
    const b = engineFor('usr_B', backing, marker, { status: () => 500 });
    await b.engine.start();
    gate.release();
    await pass;

    await expectNothingOf(b.store);
    expect(b.server.batches).toEqual([]);
    expect(await b.store.readMeta(SYNC_META_KEYS.mirrorReady)).toBeUndefined();
    expect(await b.store.readMeta(SYNC_META_KEYS.lastSyncedAt)).toBeUndefined();
  });

  it('should stop a pull in flight from landing rows or flags in the next account’s store', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const gate = gateOn('/sync/delta');
    const a = engineFor('usr_A', backing, marker, { fetchImpl: gate.fetchImpl, pages: [page({ cursor: '7', domains: { quests: [questRow('a1')] } })] });
    const pass = a.engine.start();
    await gate.reached;

    a.engine.stop();
    const b = engineFor('usr_B', backing, marker, { status: () => 500 });
    await b.engine.start();
    gate.release();
    await pass;

    await expectNothingOf(b.store);
    expect(await b.store.readMeta(SYNC_META_KEYS.cursor)).toBeUndefined();
    expect(await b.store.readMeta(SYNC_META_KEYS.mirrorReady)).toBeUndefined();
  });
});

describe('session principal', () => {
  it('should not pull or register a device once the session belongs to another account', async () => {
    const backing = sharedBacking();
    const changed: string[] = [];
    const stale = engineFor('usr_A', backing, sharedMarker(), {
      principal: async () => 'usr_B',
      onAccountChanged: () => void changed.push('session'),
      pages: [page({ cursor: '3', domains: { expenses: [expenseRow('b-expense')] } })],
    });

    await stale.engine.start();

    expect(stale.server.deltaRequests).toEqual([]);
    expect(stale.server.deviceRegistrations).toEqual([]);
    expect(await stale.store.readDomain('expenses')).toEqual([]);
    expect((await backing.keys()).filter(key => key.includes('domain:'))).toEqual([]);
    expect(stale.engine.getSnapshot().state).toBe('signed-out');
    expect(changed).toEqual(['session']);
  });

  it('should not post anything once the session belongs to another account', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = await accountA(backing, marker);
    a.engine.stop();
    const stale = engineFor('usr_A', backing, marker, { principal: async () => 'usr_B' });

    await stale.engine.start();

    expect(stale.server.batches).toEqual([]);
    expect(await stale.store.readOutbox()).toHaveLength(1);
  });
});

describe('cookie change mid-drain', () => {
  it("should discard a delta page answered for another account and never list it under the pass's account", async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const holder: { server?: FakeServer } = {};
    const a = engineFor('usr_A', backing, marker, {
      principal: async () => ((holder.server?.deltaRequests.length ?? 0) >= 2 ? 'usr_B' : 'usr_A'),
      pages: [page({ cursor: '1', hasMore: true, domains: { quests: [questRow('a1')] } }), page({ cursor: '2', domains: { expenses: [expenseRow('b-expense')] } })],
    });
    holder.server = a.server;

    await a.engine.start();

    expect(a.server.deltaRequests).toHaveLength(2);
    expect(await a.store.readDomain('expenses')).toEqual([]);
    expect(await a.store.readMeta(SYNC_META_KEYS.cursor)).toBe('1');
    a.engine.stop();
    const reopened = new MemoirStore(backing, { accountId: 'usr_A', marker });
    reopened.open();
    expect(await reopened.readDomain('expenses')).toEqual([]);
    expect((await backing.keys()).some(key => key.includes('b-expense'))).toBe(false);
  });
});

describe('two tabs on different accounts', () => {
  it('should keep rows a stale tab writes after another account claims the store out of that account', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const held = pausedPut(backing, 'domain:expenses:');
    const a = engineFor('usr_A', held.backing, marker);
    await a.engine.start();

    const write = a.store.upsertRows('expenses', [expenseRow('a-1'), expenseRow('a-2')]);
    await held.reached;
    const b = engineFor('usr_B', backing, marker);
    await b.engine.start();
    held.release();
    await write;

    expect(await b.store.readDomain('expenses')).toEqual([]);
    expect((await keysOf(backing, 'usr_B')).filter(key => key.includes('expenses'))).toEqual([]);

    await b.engine.sync();
    expect(await keysOf(backing, 'usr_A')).toEqual([]);
  });

  it("should never post a stale tab's command queued while another account claimed the store", async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const held = pausedPut(backing, 'outbox:');
    const a = engineFor('usr_A', held.backing, marker);
    await a.engine.start();

    setOnline(false);
    const enqueue = a.engine.enqueue(COMPLETE, TODAY);
    await held.reached;
    const b = engineFor('usr_B', backing, marker);
    await b.engine.start();
    held.release();
    await enqueue;
    setOnline(true);

    expect(await b.store.readOutbox()).toEqual([]);
    await b.engine.sync();
    expect(b.server.batches).toEqual([]);
    expect(await keysOf(backing, 'usr_A')).toEqual([]);
  });

  it('should leave the other account untouched and hand the stale tab back to the session when it writes after the claim', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const changed: string[] = [];
    const a = engineFor('usr_A', backing, marker, { onAccountChanged: () => void changed.push('session') });
    await a.engine.start();
    const b = engineFor('usr_B', backing, marker);
    await b.engine.start();
    const before = await keysOf(backing, 'usr_B');

    await expect(a.engine.enqueue(COMPLETE, TODAY)).resolves.toEqual({ status: 'refused', boundary: 'owner-changed' });

    expect(a.engine.getSnapshot().state).toBe('signed-out');
    expect(changed).toEqual(['session']);
    expect(await keysOf(backing, 'usr_B')).toEqual(before);
    await b.engine.sync();
    expect(b.server.batches).toEqual([]);
  });

  it('should refuse a stale tab’s command and undo its optimistic apply', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = engineFor('usr_A', backing, marker, { pages: [page({ domains: { quests: [dailyQuestRow('q1')] } })] });
    const data = createSyncedTestData(a.engine);
    await a.engine.start();
    await engineFor('usr_B', backing, marker).engine.start();

    await expect(a.engine.enqueue(COMPLETE, TODAY)).resolves.toEqual({ status: 'refused', boundary: 'owner-changed' });
    const refused = { delivery: { status: 'refused', boundary: 'owner-changed' } };
    expect(await data.provider.dispatchCommand(COMPLETE)).toMatchObject(refused);
    expect((await data.provider.getDay(TODAY)).occurrences.find(occurrence => occurrence.questId === 'q1')?.state).toBe('upcoming');

    const draft = { amountText: '7.50', currency: 'EUR' as const, categoryId: 'transport' as const, occurredOnDate: TODAY, note: 'Taxi' };
    expect(await data.finance.dispatchCommand({ type: 'expense.create', draft })).toMatchObject(refused);
    expect((await data.finance.expenses({ range: 'month', search: '', limit: 8 })).items).toEqual([]);

    expect(await data.quickLogs.dispatchCommand({ type: 'sidequest.log', draft: { date: TODAY, name: 'Fixed the bike', statAffinity: 'body' } })).toMatchObject(refused);
    expect((await data.quickLogs.sideQuests()).items).toEqual([]);

    expect(await data.hero.dispatchCommand({ type: 'title.display', titleId: null })).toMatchObject(refused);
  });

  it("should never show a stale tab the other account's queue or export job", async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const a = engineFor('usr_A', backing, marker);
    await a.engine.start();
    const b = engineFor('usr_B', backing, marker);
    await b.engine.start();
    await queuedOffline(b.engine);
    await b.store.writeMeta(SYNC_META_KEYS.exportJobId, 'job-of-B');

    expect(await a.store.readOutbox()).toEqual([]);
    expect(await a.store.readMeta(SYNC_META_KEYS.exportJobId)).toBeUndefined();
    expect((await createSyncedTestData(a.engine).account.getAppSync()).queue).toEqual([]);
  });
});

describe('pre-namespace layout', () => {
  async function legacyBacking(): Promise<KeyValueBacking> {
    const backing = sharedBacking();
    const legacy = new MemoirStore(backing);
    await legacy.upsertRows('quests', [questRow('old')]);
    await legacy.writeMeta(SYNC_META_KEYS.deviceId, 'device-of-A');
    await new MemoirStore(backing).appendOutbox({
      seq: 1,
      commandId: 'cmd-A',
      type: 'quest.complete',
      payload: {},
      performedAt: '',
      localDate: TODAY,
      createdAt: '',
      command: COMPLETE,
    });
    return backing;
  }

  it.each([['usr_B'], ['']])('should wipe it when the last-account marker is %j', async (previous: string) => {
    const backing = await legacyBacking();
    const store = new MemoirStore(backing, { accountId: 'usr_A', marker: sharedMarker(previous) });
    store.open();

    expect(await store.readDomain('quests')).toEqual([]);
    expect(await store.readOutbox()).toEqual([]);
    expect(await store.readMeta(SYNC_META_KEYS.deviceId)).toBeUndefined();
    expect(await backing.keys()).toEqual([]);
  });

  it.each([['usr_A'], [null]])('should adopt it into the account namespace when the marker is %j', async (previous: string | null) => {
    const backing = await legacyBacking();
    const marker = sharedMarker(previous);
    const store = new MemoirStore(backing, { accountId: 'usr_A', marker });
    store.open();

    expect(await store.readDomain('quests')).toHaveLength(1);
    expect(await store.readOutbox()).toHaveLength(1);
    expect(await store.readMeta(SYNC_META_KEYS.deviceId)).toBe('device-of-A');
    expect((await backing.keys()).every(key => key.startsWith('acct:usr_A:'))).toBe(true);
    expect(marker.read()).toBe('usr_A');
  });

  it('should still move a queued command whose earlier migration wrote the content but not its listing', async () => {
    const backing = await legacyBacking();
    const [legacyOutbox] = (await backing.keys()).filter(key => key.startsWith('outbox:'));
    const halfWritten = `acct:usr_A:${legacyOutbox}`;
    const entry = await backing.get(legacyOutbox as string);
    const interrupted: KeyValueBacking = { ...backing, get: key => (key === halfWritten ? Promise.resolve(entry as never) : backing.get(key)) };

    const store = new MemoirStore(interrupted, { accountId: 'usr_A', marker: sharedMarker('usr_A') });
    store.open();

    expect(await store.readOutbox()).toHaveLength(1);
    expect(await backing.keys()).toContain(halfWritten);
  });
});

describe('account namespace', () => {
  it('should keep an account whose id extends another account’s id out of that account’s scope', async () => {
    const backing = sharedBacking();
    const marker = sharedMarker();
    const extended = engineFor('usr:domain:quests', backing, marker, { pages: [page({ domains: { quests: [questRow('theirs')] } })] });
    await extended.engine.start();
    await queuedOffline(extended.engine);
    extended.engine.stop();

    const shorter = engineFor('usr', backing, marker, { status: () => 500 });
    await shorter.engine.start();

    expect(await shorter.store.readDomain('quests')).toEqual([]);
    expect(await shorter.store.readOutbox()).toEqual([]);
    expect((await backing.keys()).some(key => key.includes('theirs'))).toBe(false);
  });
});
