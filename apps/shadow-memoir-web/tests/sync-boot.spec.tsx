import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { MemoirDataProvider, useJournal } from '@/lib/data';
import { type DeltaPage, type KeyValueBacking, SyncedDataProvider, SyncedQuickLogProvider, SyncEngineProvider } from '@/lib/sync';

import { createSyncedTestData, createTestEngine, sharedBacking } from './sync-harness';

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

    const tiles = await quickLogs.tiles(TODAY, 'EUR');
    expect(tiles.find(tile => tile.id === 'expense')?.value).toBe('not yet');
    expect(tiles.find(tile => tile.id === 'steps')?.value).toBe('not yet');
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
