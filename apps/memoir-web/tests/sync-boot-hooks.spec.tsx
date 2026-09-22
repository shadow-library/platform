import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { describe, expect, it } from 'bun:test';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import { renderToString } from 'react-dom/server';

import { MemoirDataProvider, memoirKeys, useJournal } from '@/lib/data';
import { type DeltaPage, type FetchLike, type KeyValueBacking, MemoirStore, SyncClient, SyncEngine, SyncEngineProvider, useSyncReadiness, useSyncStatus } from '@/lib/sync';

import { renderHook } from './render-hook';
import { createFakeServer, createSyncedTestData, createTestEngine, sharedBacking, waitFor, waitForQuery, waitForState } from './sync-harness';

const TODAY = '2026-08-24';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '1', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

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

function engineOver(fetchImpl: FetchLike, options: { backing?: KeyValueBacking; maxPages?: number } = {}): SyncEngine {
  return new SyncEngine({ store: new MemoirStore(options.backing ?? sharedBacking()), client: new SyncClient({ fetchImpl }), today: TODAY, maxPages: options.maxPages });
}

function gatedEngine(pages: DeltaPage[] = [page({})]): { engine: SyncEngine; open: () => void } {
  const server = createFakeServer({ pages });
  const gate = { open: (): void => undefined };
  const opened = new Promise<void>(resolve => (gate.open = resolve));
  const fetchImpl: FetchLike = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/sync/delta')) await opened;
    return server.fetchImpl(input, init);
  };
  return { engine: engineOver(fetchImpl), open: () => gate.open() };
}

describe('sync boot', () => {
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

    const { result, unmount } = renderHook(() => useJournal(), { wrapper: Wrapper });

    await waitForState(engine, snapshot => snapshot.state === 'online');
    await waitForQuery(data.queryClient, () => result.current.data?.today === null);

    await engine.sync();

    await waitForQuery(data.queryClient, () => result.current.data?.today?.text === updatedText);
    expect(ambientClient.getQueryData(['memoir', 'quick-logs', 'journal'])).toBeUndefined();
    unmount();
  });
});

describe('sync readiness', () => {
  it('should report loading until the first pull completes', async () => {
    const { engine, open } = gatedEngine();
    const data = createSyncedTestData(engine);
    const { result, unmount } = renderHook(() => useSyncReadiness(), { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> });

    await waitForState(engine, snapshot => snapshot.state === 'syncing');
    expect(result.current).toEqual({ kind: 'loading' });

    open();
    await waitForState(engine, snapshot => snapshot.state === 'online');
    await waitFor(() => result.current.kind === 'ready');
    unmount();
  });

  it('should cancel a stale first fetch before a world invalidation', async () => {
    const { engine, open } = gatedEngine([page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })]);
    const data = createSyncedTestData(engine);
    let releaseReads: () => void = () => undefined;
    const readsReleased = new Promise<void>(resolve => (releaseReads = resolve));
    let reads = 0;
    const answered: number[] = [];
    const { result, rerender, unmount } = renderHook(
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

    await waitForState(engine, snapshot => snapshot.state === 'syncing');
    rerender({ enabled: true });
    await waitForQuery(data.queryClient, () => reads === 1);
    open();
    await waitForState(engine, snapshot => snapshot.state === 'online');
    releaseReads();

    await waitForQuery(data.queryClient, () => result.current.data === 1);
    expect(answered).toEqual([1]);
    unmount();
  });

  it('should be ready on a warm reload while an account request is still pending', async () => {
    const backing = sharedBacking();
    await createTestEngine({ backing, today: TODAY }).engine.start();
    const { engine, server } = createTestEngine({ backing, today: TODAY });
    const data = createSyncedTestData(engine);
    const { result, unmount } = renderHook(
      () => {
        useQuery({ queryKey: ['memoir', 'account', 'onboarding'], queryFn: () => new Promise<never>(() => undefined) }, data.queryClient);
        return useSyncReadiness();
      },
      { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> },
    );

    await waitFor(() => result.current.kind === 'ready');
    await waitFor(() => server.deltaRequests.length > 0);

    await engine.enqueue({ type: 'quest.complete', occurrenceId: `q1:${TODAY}` }, TODAY);
    await waitFor(() => server.batches.length === 1);
    await waitForState(engine, snapshot => snapshot.queuedCount === 0);
    unmount();
  });

  it('should become ready once the browser reconnects after a cold offline start', async () => {
    setOnline(false);
    const { engine } = createTestEngine({ today: TODAY });
    const data = createSyncedTestData(engine);
    const { result, unmount } = renderHook(() => useSyncReadiness(), { wrapper: ({ children }) => <SyncEngineProvider data={data}>{children}</SyncEngineProvider> });
    await waitForState(engine, snapshot => snapshot.readiness.kind === 'failed');
    await waitFor(() => result.current.kind === 'failed');

    setOnline(true);
    window.dispatchEvent(new Event('online'));

    await waitForState(engine, snapshot => snapshot.readiness.kind === 'ready');
    await waitFor(() => result.current.kind === 'ready');
    unmount();
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
