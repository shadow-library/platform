import { afterAll, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';

import { type DeltaPage, type FetchLike, type KeyValueBacking, MemoirStore, SyncClient, SyncedDataProvider, SyncedQuickLogProvider, SyncEngine } from '@/lib/sync';

import { createFakeServer, createTestEngine, type FakeServer, sharedBacking, waitFor } from './sync-harness';

const TODAY = '2026-08-24';

/** The wire form of a *daily* quest: `toRecurrenceRule` sends `daysOfWeek` only for a weekly rule, so a real daily row carries none. */
function dailyQuestRow(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
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

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '1', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

/**
 * IndexedDB resolves on the task queue, not the microtask queue. A backing that resolves immediately hides
 * every ordering bug between a reprojection and the refetch a world listener triggers, which is why the
 * browser failed where the suite passed. `setImmediate` schedules on that same task queue — unlike
 * `setTimeout`, which carries per-call timer overhead that a store boot's ~90 sequential reads/writes turns
 * into real wall-clock seconds — so it reproduces the ordering hazard without the cost.
 */
function slowBacking(): KeyValueBacking {
  const inner = sharedBacking();
  const defer = <T>(value: Promise<T>): Promise<T> => new Promise(resolve => setImmediate(() => void value.then(resolve)));
  return {
    get: key => defer(inner.get(key)),
    put: (key, value) => defer(inner.put(key, value)),
    delete: key => defer(inner.delete(key)),
    keys: () => defer(inner.keys()),
  };
}

function engineOver(fetchImpl: FetchLike, options: { backing?: KeyValueBacking; maxPages?: number } = {}): SyncEngine {
  return new SyncEngine({ store: new MemoirStore(options.backing ?? sharedBacking()), client: new SyncClient({ fetchImpl }), today: TODAY, maxPages: options.maxPages });
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

/** `navigator` is a single process-wide object under bun, so a test that leaves it offline would otherwise bleed into every file that runs after this one. */
afterAll(() => setOnline(true));

describe('sync boot', () => {
  it('should have the day projected before a world listener is told the rows changed', async () => {
    const { engine } = createTestEngine({ backing: slowBacking(), today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const provider = new SyncedDataProvider(engine);

    const seen: number[] = [];
    engine.subscribeWorld(() => void provider.getDay(TODAY).then(day => seen.push(day.occurrences.length)));
    await engine.start();
    await new Promise(resolve => setImmediate(resolve));

    expect(seen.at(-1)).toBe(1);
  });

  it('should schedule a daily quest whose row carries no explicit weekdays', async () => {
    const { engine } = createTestEngine({ today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const provider = new SyncedDataProvider(engine);
    await engine.start();

    const day = await provider.getDay(TODAY);
    expect(day.occurrences.map(occurrence => occurrence.questName)).toEqual(['Morning run']);
  });

  it('should report an unopenable store instead of leaving the world empty', async () => {
    const broken: KeyValueBacking = {
      get: () => Promise.reject(new Error('The database could not be opened.')),
      put: () => Promise.reject(new Error('The database could not be opened.')),
      delete: () => Promise.reject(new Error('The database could not be opened.')),
      keys: () => Promise.reject(new Error('The database could not be opened.')),
    };
    const { engine } = createTestEngine({ backing: broken, today: TODAY });

    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.getSnapshot().initError).toBe('The database could not be opened.');
  });

  it('should build the day rail tiles from logged rows rather than from a fixture', async () => {
    const journalRow = { id: 'j1', date: TODAY, text: 'Ran the long way home today.', mood: 4, loggedAt: `${TODAY}T21:00:00.000Z`, rewarded: true };
    const { engine } = createTestEngine({ today: TODAY, pages: [page({ domains: { journal_entries: [journalRow] } })] });
    const quickLogs = new SyncedQuickLogProvider(engine);
    await engine.start();

    const tiles = await quickLogs.tiles(TODAY);
    expect(tiles.find(tile => tile.id === 'expense')?.value).toBe('nothing logged');
    expect(tiles.find(tile => tile.id === 'steps')?.value).toBe('nothing logged');
    expect(tiles.find(tile => tile.id === 'journal')?.value).toMatch(/\d+ words/);
  });
});

describe('device registration', () => {
  beforeEach(() => setOnline(true));

  it('should reuse the stored device id after reload', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, accountId: 'usr_A' });
    await first.engine.start();
    first.engine.stop();
    const reloaded = createTestEngine({ backing, accountId: 'usr_A' });
    await reloaded.engine.start();

    expect(first.server.deviceRegistrations).toHaveLength(1);
    expect(reloaded.server.deviceRegistrations).toEqual(first.server.deviceRegistrations);
  });

  it('should register a new device id deliberately when another account opens the store', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, accountId: 'usr_A' });
    await first.engine.start();
    first.engine.stop();
    const next = createTestEngine({ backing, accountId: 'usr_B' });
    await next.engine.start();

    expect(next.server.deviceRegistrations).toHaveLength(1);
    expect(next.server.deviceRegistrations).not.toEqual(first.server.deviceRegistrations);
  });
});

describe('sync readiness', () => {
  beforeEach(() => setOnline(true));

  it('should report failed when the first pull errors', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 500 });
    await engine.start();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'server' });
  });

  it('should report deletion-pending for ACC_002', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 403, errorCode: 'ACC_002' });
    await engine.start();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'deletion-pending' });
  });

  it('should report deletion-pending over a mirror that was already pulled', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();
    const { engine } = createTestEngine({ backing, today: TODAY, status: () => 403, errorCode: 'ACC_002' });
    await engine.start();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'deletion-pending' });
  });

  it('should report signed-out when the first pull is unauthorized', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 401 });
    await engine.start();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'signed-out' });
  });

  it('should report offline on a cold start without a connection', async () => {
    const { engine } = createTestEngine({ today: TODAY });
    setOnline(false);
    await engine.start();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'offline' });
  });

  it('should be ready at once on a warm reload, even offline or failing', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();

    const failing = createTestEngine({ backing, today: TODAY, status: () => 500 }).engine;
    await failing.hydrate();
    expect(failing.getSnapshot().readiness).toEqual({ kind: 'ready' });
    await failing.sync();
    expect(failing.getSnapshot()).toMatchObject({ state: 'failed', readiness: { kind: 'ready' } });

    setOnline(false);
    const offline = createTestEngine({ backing, today: TODAY }).engine;
    await offline.start();
    expect(offline.getSnapshot()).toMatchObject({ state: 'offline', readiness: { kind: 'ready' } });
  });

  it('should treat a mirror synced before the readiness marker existed as ready', async () => {
    const backing = sharedBacking();
    await new MemoirStore(backing).writeMeta('last-synced-at', '2026-08-23T08:00:00.000Z');
    const { engine } = createTestEngine({ backing, today: TODAY });
    await engine.hydrate();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'ready' });
  });

  it('should stay cold across a reload when the refill after an epoch reset fails', async () => {
    const backing = sharedBacking();
    const holder: { server?: FakeServer } = {};
    const { engine, server } = createTestEngine({ backing, today: TODAY, status: () => ((holder.server?.deltaRequests.length ?? 0) >= 2 ? 500 : 200) });
    holder.server = server;
    await engine.start();

    server.epoch = 'epoch-2';
    await engine.sync();
    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'server' });

    const reloaded = createTestEngine({ backing, today: TODAY }).engine;
    await reloaded.hydrate();
    expect(reloaded.getSnapshot().readiness).toEqual({ kind: 'loading' });
  });

  it('should return to loading while an epoch change refills the mirror', async () => {
    const { engine, server } = createTestEngine({ today: TODAY });
    await engine.start();
    const seen: string[] = [];
    engine.subscribe(() => seen.push(engine.getSnapshot().readiness.kind));

    server.epoch = 'epoch-2';
    await engine.sync();

    expect(seen).toContain('loading');
    expect(engine.getSnapshot().readiness).toEqual({ kind: 'ready' });
  });

  it('should start a distinct ready epoch after an epoch change even when the clock stands still', async () => {
    setSystemTime(new Date(`${TODAY}T08:00:00.000Z`));
    try {
      const { engine, server } = createTestEngine({ today: TODAY });
      await engine.start();
      const first = engine.getSnapshot().readySince;

      server.epoch = 'epoch-2';
      await engine.sync();

      expect(engine.getSnapshot().readySince).toBeGreaterThan(first);
    } finally {
      setSystemTime();
    }
  });

  it('should load after retrying a failed first pull', async () => {
    let status = 500;
    const { engine } = createTestEngine({ today: TODAY, status: () => status });
    await engine.start();
    expect(engine.getSnapshot().readiness.kind).toBe('failed');

    status = 200;
    await engine.sync();

    expect(engine.getSnapshot().readiness).toEqual({ kind: 'ready' });
  });

  it('should report a refused connection as a server failure while the browser is online', async () => {
    const engine = engineOver(() => Promise.reject(new TypeError('Failed to fetch')));
    await engine.start();

    expect(engine.getSnapshot()).toMatchObject({ state: 'failed', readiness: { kind: 'failed', reason: 'server' } });
  });

  it('should persist a pending deletion so a warm reload shows it at once', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();
    await createTestEngine({ backing, today: TODAY, status: () => 403, errorCode: 'ACC_002' }).engine.start();

    const reloaded = createTestEngine({ backing, today: TODAY }).engine;
    await reloaded.hydrate();
    expect(reloaded.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'deletion-pending' });

    await reloaded.sync();
    const again = createTestEngine({ backing, today: TODAY }).engine;
    await again.hydrate();
    expect(again.getSnapshot().readiness).toEqual({ kind: 'ready' });
  });

  it('should keep pulling while the cursor advances past the page budget', async () => {
    const pages = [page({ cursor: '1', hasMore: true }), page({ cursor: '2', hasMore: true }), page({ cursor: '3', domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })];
    const server = createFakeServer({ pages });
    const engine = engineOver(server.fetchImpl, { maxPages: 1 });
    await engine.start();

    expect(engine.getSnapshot()).toMatchObject({ state: 'online', readiness: { kind: 'ready' } });
    expect(server.deltaRequests).toHaveLength(3);
  });

  it('should report a server failure when the pull stops making progress', async () => {
    const backing = sharedBacking();
    const server = createFakeServer({ pages: [page({ cursor: '1', hasMore: true })] });
    const engine = engineOver(server.fetchImpl, { backing, maxPages: 2 });
    await engine.start();
    expect(engine.getSnapshot()).toMatchObject({ state: 'failed', readiness: { kind: 'failed', reason: 'server' } });

    const reloaded = engineOver(server.fetchImpl, { backing });
    await reloaded.hydrate();
    expect(reloaded.getSnapshot().readiness).toEqual({ kind: 'loading' });
  });

  it('should flush a command enqueued while the engine is still booting', async () => {
    const { engine, server } = createTestEngine({ today: TODAY });
    const starting = engine.start();
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    await starting;

    await waitFor(() => server.batches.length === 1);
    expect(engine.getSnapshot().queuedCount).toBe(0);
  });

  it('should leave the next hydrate loading when the second page fails', async () => {
    const backing = sharedBacking();
    const holder: { server?: FakeServer } = {};
    const pages = [page({ cursor: '1', hasMore: true }), page({ cursor: '2' })];
    const { engine, server } = createTestEngine({ backing, today: TODAY, pages, status: () => ((holder.server?.deltaRequests.length ?? 0) >= 1 ? 500 : 200) });
    holder.server = server;
    await engine.start();
    expect(engine.getSnapshot().readiness).toEqual({ kind: 'failed', reason: 'server' });

    const reloaded = createTestEngine({ backing, today: TODAY }).engine;
    await reloaded.hydrate();
    expect(reloaded.getSnapshot().readiness).toEqual({ kind: 'loading' });
  });
});
