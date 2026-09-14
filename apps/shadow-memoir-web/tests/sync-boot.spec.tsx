import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { toast } from '@shadow-library/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataState } from '@/components/DataState';
import { NetStrip, SystemOverlayProvider } from '@/features/shell';
import { type DayView, MemoirDataProvider, memoirKeys, notifyOutcome, useCommand, useDay, useJournal } from '@/lib/data';
import {
  type DeltaPage,
  type KeyValueBacking,
  MemoirStore,
  SYNC_META_KEYS,
  SyncClient,
  SyncedDataProvider,
  type SyncedMemoirData,
  SyncedQuickLogProvider,
  SyncEngine,
  SyncEngineProvider,
  useSyncReadiness,
  useSyncStatus,
} from '@/lib/sync';

import { renderScreen } from './harness';
import { createFakeServer, createSyncedTestData, createTestEngine, type FakeServer, sharedBacking } from './sync-harness';

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
 * browser failed where the suite passed.
 */
function slowBacking(): KeyValueBacking {
  const inner = sharedBacking();
  const defer = <T,>(value: Promise<T>): Promise<T> => new Promise(resolve => setTimeout(() => void value.then(resolve), 0));
  return {
    get: key => defer(inner.get(key)),
    put: (key, value) => defer(inner.put(key, value)),
    delete: key => defer(inner.delete(key)),
    keys: () => defer(inner.keys()),
  };
}

describe('sync boot', () => {
  it('should have the day projected before a world listener is told the rows changed', async () => {
    const { engine } = createTestEngine({ backing: slowBacking(), today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const provider = new SyncedDataProvider(engine);

    const seen: number[] = [];
    engine.subscribeWorld(() => void provider.getDay(TODAY).then(day => seen.push(day.occurrences.length)));
    await engine.start();
    await new Promise(resolve => setTimeout(resolve, 10));

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

  /**
   * The finance/quick-log hooks used to read the ambient `useQueryClient()` — whatever `QueryClientProvider`
   * happened to wrap them — while the sync engine's world listener always invalidates `data.queryClient`
   * (see `SyncEngineProvider`). Production nests both under one tree with two different clients: the router
   * installs its own ambient one, and `MemoirDataProvider` carries a second. A hook on the wrong client never
   * saw the invalidation and rendered whatever it had fetched on mount forever. This mounts that exact shape —
   * an ambient client that is NOT `data.queryClient` — so a hook reading the wrong one would hang stale here.
   */
  it('should refetch a quick-log query on the same client the sync engine invalidates after a delta pull', async () => {
    const updatedText = 'Second pull replaced this entry.';
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [
        page({ cursor: '1', domains: {} }),
        page({ cursor: '2', domains: { journal_entries: [{ id: 'j1', date: TODAY, text: updatedText, mood: 3, loggedAt: `${TODAY}T08:00:00.000Z`, rewarded: true }] } }),
      ],
    });
    const data = createSyncedTestData(engine);
    const ambientClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Wrapper({ children }: { children: ReactNode }): ReactNode {
      return (
        <QueryClientProvider client={ambientClient}>
          <MemoirDataProvider value={data}>
            <SyncEngineProvider data={data}>{children}</SyncEngineProvider>
          </MemoirDataProvider>
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useJournal(), { wrapper: Wrapper });

    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));
    await waitFor(() => expect(result.current.data?.today).toBeNull());

    await engine.sync();

    await waitFor(() => expect(result.current.data?.today?.text).toBe(updatedText));
    expect(ambientClient.getQueryData(['memoir', 'quick-logs', 'journal'])).toBeUndefined();
  });
});

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

function engineOver(fetchImpl: typeof fetch, options: { backing?: KeyValueBacking; maxPages?: number } = {}): SyncEngine {
  return new SyncEngine({ store: new MemoirStore(options.backing ?? sharedBacking()), client: new SyncClient({ fetchImpl }), today: TODAY, maxPages: options.maxPages });
}

function gatedEngine(pages: DeltaPage[] = [page({})]): { engine: SyncEngine; open: () => void } {
  const server = createFakeServer({ pages });
  const gate = { open: (): void => undefined };
  const opened = new Promise<void>(resolve => (gate.open = resolve));
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/sync/delta')) await opened;
    return server.fetchImpl(input, init);
  }) as typeof fetch;
  return { engine: engineOver(fetchImpl), open: () => gate.open() };
}

function renderStrip(engine: SyncEngine): void {
  const data = createSyncedTestData(engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <SystemOverlayProvider>
        <NetStrip />
      </SystemOverlayProvider>
    </SyncEngineProvider>,
    { value: data },
  );
}

describe('offline strip', () => {
  beforeEach(() => setOnline(true));

  it('should mark the strip offline with the queued count when the device drops offline after load', async () => {
    const { engine } = createTestEngine({ today: TODAY });
    renderStrip(engine);
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText(/^Offline\./)).toBeDefined();

    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    expect(await screen.findByText('1 queued')).toBeDefined();
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

  it('should report loading until the first pull completes', async () => {
    const { engine, open } = gatedEngine();
    const data = createSyncedTestData(engine);
    const { result } = renderHook(() => useSyncReadiness(), { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> });

    await waitFor(() => expect(engine.getSnapshot().state).toBe('syncing'));
    expect(result.current).toEqual({ kind: 'loading' });

    open();
    await waitFor(() => expect(result.current).toEqual({ kind: 'ready' }));
  });

  it('should cancel a stale first fetch before a world invalidation', async () => {
    const { engine, open } = gatedEngine([page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })]);
    const data = createSyncedTestData(engine);
    let releaseReads: () => void = () => undefined;
    const readsReleased = new Promise<void>(resolve => (releaseReads = resolve));
    let reads = 0;
    const answered: number[] = [];
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        const query = useQuery(
          {
            queryKey: [...memoirKeys.all, 'first-fetch-probe'],
            enabled,
            queryFn: async () => {
              reads += 1;
              const quests = engine.domains().quests?.length ?? 0;
              await readsReleased;
              return quests;
            },
          },
          data.queryClient,
        );
        useEffect(() => void (query.data === undefined || answered.push(query.data)), [query.data]);
        return query;
      },
      { initialProps: { enabled: false }, wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> },
    );

    await waitFor(() => expect(engine.getSnapshot().state).toBe('syncing'));
    rerender({ enabled: true });
    await waitFor(() => expect(reads).toBe(1));
    open();
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));
    releaseReads();

    await waitFor(() => expect(result.current.data).toBe(1));
    expect(answered).toEqual([1]);
  });

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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T08:00:00.000Z`));
    try {
      const { engine, server } = createTestEngine({ today: TODAY });
      await engine.start();
      const first = engine.getSnapshot().readySince;

      server.epoch = 'epoch-2';
      await engine.sync();

      expect(engine.getSnapshot().readySince).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
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
    const engine = engineOver((() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch);
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

  it('should be ready on a warm reload while an account request is still pending', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();
    const { engine, server } = createTestEngine({ backing, today: TODAY });
    const data = createSyncedTestData(engine);
    const { result } = renderHook(
      () => {
        useQuery({ queryKey: ['memoir', 'account', 'onboarding'], queryFn: () => new Promise<never>(() => undefined) }, data.queryClient);
        return useSyncReadiness();
      },
      { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> },
    );

    await waitFor(() => expect(result.current).toEqual({ kind: 'ready' }));
    await waitFor(() => expect(server.deltaRequests.length).toBeGreaterThan(0));

    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    await waitFor(() => expect(server.batches).toHaveLength(1));
    expect(engine.getSnapshot().queuedCount).toBe(0);
  });

  it('should flush a command enqueued while the engine is still booting', async () => {
    const { engine, server } = createTestEngine({ today: TODAY });
    const starting = engine.start();
    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    await starting;

    await waitFor(() => expect(server.batches).toHaveLength(1));
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

  it('should become ready once the browser reconnects after a cold offline start', async () => {
    setOnline(false);
    const { engine } = createTestEngine({ today: TODAY });
    const data = createSyncedTestData(engine);
    const { result } = renderHook(() => useSyncReadiness(), { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> });
    await waitFor(() => expect(result.current).toEqual({ kind: 'failed', reason: 'offline' }));

    setOnline(true);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(result.current).toEqual({ kind: 'ready' }));
  });

  it('should not report ready before mirror queries have refetched the pulled rows', async () => {
    const { engine, open } = gatedEngine([page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })]);
    const data = createSyncedTestData(engine);
    const getDay = data.provider.getDay.bind(data.provider);
    vi.spyOn(data.provider, 'getDay').mockImplementation(async date => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return getDay(date);
    });
    const emptyRenders: number[] = [];
    function EmptyProbe(): ReactElement {
      emptyRenders.push(1);
      return <span>empty</span>;
    }
    function Today(): ReactElement {
      return (
        <DataState query={useDay()} isEmpty={day => day.occurrences.length === 0} skeleton={<span>skeleton</span>} empty={<EmptyProbe />}>
          {day => <span>{day.occurrences.length} quests</span>}
        </DataState>
      );
    }
    renderScreen(
      <SyncEngineProvider data={data}>
        <Today />
      </SyncEngineProvider>,
      { value: data },
    );

    await waitFor(() => expect(engine.getSnapshot().state).toBe('syncing'));
    await waitFor(() => expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(TODAY))?.data?.occurrences).toEqual([]));
    open();

    expect(await screen.findByText('1 quests')).toBeDefined();
    expect(emptyRenders).toEqual([]);
  });

  it('should paint loading rather than a failure in the server snapshot', () => {
    const { engine } = createTestEngine({ today: TODAY });
    function Probe(): ReactElement {
      return <span>{useSyncReadiness().kind}</span>;
    }

    const html = renderToString(
      <SyncEngineProvider data={createSyncedTestData(engine)}>
        <Probe />
      </SyncEngineProvider>,
    );

    expect(html).toContain('loading');
  });

  it('should not carry an offline verdict in the server snapshot', () => {
    const { engine } = createTestEngine({ today: TODAY });
    function Probe(): ReactElement {
      return <span>{useSyncStatus().state}</span>;
    }

    const html = renderToString(
      <SyncEngineProvider data={createSyncedTestData(engine)}>
        <Probe />
      </SyncEngineProvider>,
    );

    expect(html).toContain('online');
    expect(html).not.toContain('offline');
  });
});

function holdMirrorReady(): { backing: KeyValueBacking; release: () => void } {
  const inner = sharedBacking();
  const gate = { open: (): void => undefined };
  const released = new Promise<void>(resolve => (gate.open = resolve));
  const put: KeyValueBacking['put'] = async (key, value) => {
    if (key.endsWith(SYNC_META_KEYS.mirrorReady)) await released;
    return inner.put(key, value);
  };
  return { backing: { ...inner, put }, release: () => gate.open() };
}

function slowDay(data: SyncedMemoirData): void {
  const getDay = data.provider.getDay.bind(data.provider);
  vi.spyOn(data.provider, 'getDay').mockImplementation(async date => {
    await new Promise(resolve => setTimeout(resolve, 20));
    return getDay(date);
  });
}

function CompleteQuest(): ReactElement {
  const command = useCommand();
  const complete = async (): Promise<void> => {
    const outcome = await command.run({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` });
    if (outcome.status === 'needs-confirmation') return;
    notifyOutcome(outcome, { success: 'Quest completed.', action: 'complete', subject: 'Morning run' });
  };
  return <button onClick={() => void complete()}>Complete</button>;
}

interface SkeletonProbe {
  skeleton: ReactNode;
  mounts: () => number;
}

function skeletonProbe(): SkeletonProbe {
  let mounts = 0;
  function Skeleton(): ReactElement {
    useEffect(() => void (mounts += 1), []);
    return <span>skeleton</span>;
  }
  return { skeleton: <Skeleton />, mounts: () => mounts };
}

function renderMirrorScreen(data: SyncedMemoirData, node: ReactNode): void {
  renderScreen(<SyncEngineProvider data={data}>{node}</SyncEngineProvider>, { value: data });
}

function renderDayState(data: SyncedMemoirData, { inside, outside }: { inside?: ReactNode; outside?: ReactNode }): SkeletonProbe {
  const probe = skeletonProbe();
  function Today(): ReactElement {
    return (
      <DataState query={useDay()} skeleton={probe.skeleton}>
        {day => (
          <section data-testid="day">
            {day.occurrences.length} quests
            {inside}
          </section>
        )}
      </DataState>
    );
  }
  renderMirrorScreen(
    data,
    <>
      <Today />
      {outside}
    </>,
  );
  return probe;
}

describe('DataState over a refetching mirror', () => {
  const pages = [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })];

  beforeEach(() => setOnline(true));
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should keep ready content when the post-pull refetch finished before ready', async () => {
    const success = vi.spyOn(toast, 'success');
    const held = holdMirrorReady();
    const { engine } = createTestEngine({ backing: held.backing, today: TODAY, pages });
    const data = createSyncedTestData(engine);
    const view = renderDayState(data, { outside: <CompleteQuest /> });
    await waitFor(() => expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(TODAY))).toMatchObject({ fetchStatus: 'idle', data: { occurrences: [expect.anything()] } }));
    expect(engine.getSnapshot().readiness).toEqual({ kind: 'loading' });

    held.release();
    const content = await screen.findByTestId('day');
    expect(data.queryClient.getQueryState(memoirKeys.day(TODAY))?.dataUpdatedAt).toBeLessThan(engine.getSnapshot().readySince);
    const mounts = view.mounts();
    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Complete' }).click());

    await waitFor(() => expect(success).toHaveBeenCalledWith('Quest completed.', undefined));
    expect(screen.getByTestId('day')).toBe(content);
    expect(view.mounts()).toBe(mounts);
  });

  it('should keep ready content while a command refetches the mirror', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T08:00:00.000Z`));
    const success = vi.spyOn(toast, 'success');
    const { engine } = createTestEngine({ today: TODAY, pages });
    const data = createSyncedTestData(engine);
    const view = renderDayState(data, { outside: <CompleteQuest /> });
    const content = await screen.findByTestId('day');
    await waitFor(() => expect(content.textContent).toBe('1 quests'));

    const mounts = view.mounts();
    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Complete' }).click());

    await waitFor(() => expect(success).toHaveBeenCalledWith('Quest completed.', undefined));
    expect(screen.getByTestId('day')).toBe(content);
    expect(view.mounts()).toBe(mounts);
  });

  it('should settle a command run from inside a page-level DataState', async () => {
    const success = vi.spyOn(toast, 'success');
    const held = holdMirrorReady();
    const { engine } = createTestEngine({ backing: held.backing, today: TODAY, pages });
    const data = createSyncedTestData(engine);
    renderDayState(data, { inside: <CompleteQuest /> });
    await waitFor(() => expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(TODAY))).toMatchObject({ fetchStatus: 'idle', data: { occurrences: [expect.anything()] } }));
    held.release();

    const complete = await screen.findByRole('button', { name: 'Complete' });
    slowDay(data);
    act(() => complete.click());

    await waitFor(() => expect(success).toHaveBeenCalledWith('Quest completed.', undefined));
    expect(screen.getByRole('button', { name: 'Complete' })).toBe(complete);
  });

  it('should keep the previous content while a keyed mirror query loads its next key', async () => {
    const { engine } = createTestEngine({ today: TODAY, pages });
    const data = createSyncedTestData(engine);
    const probe = skeletonProbe();
    function Days(): ReactElement {
      const [date, setDate] = useState(TODAY);
      const day = useQuery({ queryKey: memoirKeys.day(date), queryFn: () => data.provider.getDay(date), placeholderData: keepPreviousData }, data.queryClient);
      return (
        <DataState query={day} skeleton={probe.skeleton}>
          {view => (
            <section data-testid="day">
              {view.date}
              <button onClick={() => setDate('2026-08-25')}>Next day</button>
            </section>
          )}
        </DataState>
      );
    }
    renderMirrorScreen(data, <Days />);
    const content = await screen.findByTestId('day');
    await waitFor(() => expect(engine.getSnapshot().state).toBe('online'));

    const mounts = probe.mounts();
    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Next day' }).click());

    await waitFor(() => expect(content.textContent).toContain('2026-08-25'));
    expect(screen.getByTestId('day')).toBe(content);
    expect(probe.mounts()).toBe(mounts);
  });

  it('should not show the skeleton when a DataState remounts after the first pull', async () => {
    const held = holdMirrorReady();
    const { engine } = createTestEngine({ backing: held.backing, today: TODAY, pages });
    const data = createSyncedTestData(engine);
    const probe = skeletonProbe();
    function Today(): ReactElement {
      return (
        <DataState query={useDay()} skeleton={probe.skeleton}>
          {day => <section data-testid="day">{day.occurrences.length} quests</section>}
        </DataState>
      );
    }
    function Screen(): ReactElement {
      const [open, setOpen] = useState(true);
      return (
        <>
          {open && <Today />}
          <button onClick={() => setOpen(!open)}>Toggle</button>
        </>
      );
    }
    renderMirrorScreen(data, <Screen />);
    await waitFor(() => expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(TODAY))).toMatchObject({ fetchStatus: 'idle', data: { occurrences: [expect.anything()] } }));
    held.release();
    await screen.findByTestId('day');
    expect(data.queryClient.getQueryState(memoirKeys.day(TODAY))?.dataUpdatedAt).toBeLessThan(engine.getSnapshot().readySince);

    act(() => screen.getByRole('button', { name: 'Toggle' }).click());
    expect(screen.queryByTestId('day')).toBeNull();
    const mounts = probe.mounts();
    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Toggle' }).click());

    expect(screen.getByTestId('day').textContent).toBe('1 quests');
    expect(data.queryClient.getQueryState(memoirKeys.day(TODAY))?.fetchStatus).toBe('fetching');
    await waitFor(() => expect(data.queryClient.getQueryState(memoirKeys.day(TODAY))?.fetchStatus).toBe('idle'));
    expect(probe.mounts()).toBe(mounts);
  });

  it('should not show the skeleton for a keyed query cached during the first pull once ready', async () => {
    const tomorrow = '2026-08-25';
    const held = holdMirrorReady();
    const { engine } = createTestEngine({ backing: held.backing, today: TODAY, pages });
    const data = createSyncedTestData(engine);
    const probe = skeletonProbe();
    function Tomorrow(): null {
      useDay(tomorrow);
      return null;
    }
    function Days(): ReactElement {
      const [date, setDate] = useState(TODAY);
      return (
        <DataState query={useDay(date)} skeleton={probe.skeleton}>
          {view => (
            <section data-testid="day">
              {view.date} {view.occurrences.length} quests
              <button onClick={() => setDate(tomorrow)}>Next day</button>
            </section>
          )}
        </DataState>
      );
    }
    function Screen(): ReactElement {
      const [peeking, setPeeking] = useState(true);
      return (
        <>
          <Days />
          {peeking && <Tomorrow />}
          <button onClick={() => setPeeking(false)}>Stop peeking</button>
        </>
      );
    }
    renderMirrorScreen(data, <Screen />);
    await waitFor(() =>
      expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(tomorrow))).toMatchObject({ fetchStatus: 'idle', data: { occurrences: [expect.anything()] } }),
    );
    held.release();
    const content = await screen.findByTestId('day');
    act(() => screen.getByRole('button', { name: 'Stop peeking' }).click());

    const mounts = probe.mounts();
    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Next day' }).click());

    expect(screen.getByTestId('day').textContent).toContain(`${tomorrow} 1 quests`);
    await waitFor(() => expect(data.queryClient.getQueryState(memoirKeys.day(tomorrow))?.fetchStatus).toBe('idle'));
    expect(screen.getByTestId('day')).toBe(content);
    expect(probe.mounts()).toBe(mounts);
  });

  it('should hold a key cached before the first pull landed behind the skeleton when a ready DataState switches to it', async () => {
    const tomorrow = '2026-08-25';
    const { engine, open } = gatedEngine(pages);
    const data = createSyncedTestData(engine);
    const shownTomorrow: number[] = [];
    function Tomorrow(): null {
      useDay(tomorrow);
      return null;
    }
    function Days(): ReactElement {
      const [date, setDate] = useState(TODAY);
      return (
        <DataState query={useDay(date)} skeleton={<span>skeleton</span>}>
          {view => {
            if (view.date === tomorrow) shownTomorrow.push(view.occurrences.length);
            return (
              <section data-testid="day">
                {view.date} {view.occurrences.length} quests
                <button onClick={() => setDate(tomorrow)}>Next day</button>
              </section>
            );
          }}
        </DataState>
      );
    }
    function Screen(): ReactElement {
      const [peeking, setPeeking] = useState(true);
      return (
        <>
          <Days />
          {peeking && <Tomorrow />}
          <button onClick={() => setPeeking(false)}>Stop peeking</button>
        </>
      );
    }
    renderMirrorScreen(data, <Screen />);
    await waitFor(() => expect(data.queryClient.getQueryState<DayView>(memoirKeys.day(tomorrow))?.data?.occurrences).toEqual([]));
    act(() => screen.getByRole('button', { name: 'Stop peeking' }).click());
    open();
    await screen.findByTestId('day');

    slowDay(data);
    act(() => screen.getByRole('button', { name: 'Next day' }).click());

    expect(screen.getByText('skeleton')).toBeDefined();
    await waitFor(() => expect(screen.getByTestId('day').textContent).toContain(`${tomorrow} 1 quests`));
    expect(shownTomorrow).not.toContain(0);
  });
});

describe('NetStrip first sync', () => {
  beforeEach(() => setOnline(true));

  it('should read Syncing… during a cold first sync', async () => {
    const { engine, open } = gatedEngine();
    renderStrip(engine);

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Syncing…'));
    open();
  });

  it('should not mention queued changes when nothing is queued', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 500 });
    renderStrip(engine);

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/couldn't reach shadow memoir, so your data hasn't loaded/i));
    expect(screen.getByRole('status').textContent).not.toMatch(/waiting|queued/i);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });

  it('should retry the pull from the strip', async () => {
    let status = 500;
    const { engine } = createTestEngine({ today: TODAY, status: () => status });
    renderStrip(engine);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    status = 200;
    retry.click();

    await waitFor(() => expect(engine.getSnapshot().readiness).toEqual({ kind: 'ready' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('should say a failed sync over a pulled mirror keeps the device data', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();
    renderStrip(createTestEngine({ backing, today: TODAY, status: () => 500 }).engine);

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/couldn't reach shadow memoir\. everything on this device is kept/i));
  });

  it('should keep focus on Try again while the retry runs', async () => {
    const failSlowly = (async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ message: 'no' }), { status: 500 });
    }) as typeof fetch;
    renderStrip(engineOver(failSlowly));
    const button = await screen.findByRole('button', { name: 'Try again' });

    button.focus();
    button.click();
    await waitFor(() => expect(button.textContent).toBe('Trying again…'));

    await waitFor(() => expect(button.textContent).toBe('Try again'));
    expect(document.activeElement).toBe(button);
  });

  it('should explain a pending deletion without offering a retry', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 403, errorCode: 'ACC_002' });
    renderStrip(engine);

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/being deleted/i));
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
