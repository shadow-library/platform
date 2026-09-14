import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@shadow-library/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TodayScreen } from '@/features/today';
import { type DeltaPage, type SyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine, deltaResponse, rejected, type TestEngine } from './sync-harness';

const TODAY = '2026-08-24';
const OCCURRENCE = `q1:${TODAY}`;

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

/** What the server's own delta carries back once it has applied the command — the row that has to keep the occurrence completed after the outbox drains. */
function completedLogRow(): Record<string, unknown> {
  return {
    id: 'log-1',
    questId: 'q1',
    date: TODAY,
    state: 'completed',
    xpAwarded: 10,
    coinsAwarded: 1,
    reasonTag: null,
    reasonNote: null,
    rescheduledToMin: null,
    postponedToDate: null,
    statAffinity: 'body',
    performedAt: `${TODAY}T07:30:00.000Z`,
    createdAt: `${TODAY}T07:30:00.000Z`,
    syncSeq: '2',
  };
}

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '1', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

/** Both halves of "offline": what the engine reads (`navigator.onLine`) and what React Query pauses on. */
function setOffline(offline: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: !offline });
  onlineManager.setOnline(!offline);
  window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
}

function renderToday(data: SyncedMemoirData): void {
  renderScreen(
    <SyncEngineProvider data={data}>
      <TodayScreen />
    </SyncEngineProvider>,
    { value: data },
  );
}

/**
 * The whole write path a completion takes from the screen the owner clicks: optimistic apply, outbox row,
 * flush. It is deliberately not the provider in isolation — the defect it guards lived entirely in the React
 * Query layer between the two, where a paused mutation swallowed the click and nothing below ever ran.
 */
describe('completing a quest from Today', () => {
  afterEach(() => setOffline(false));

  it('should flip the occurrence immediately while offline and queue the command', async () => {
    const { engine, server } = createTestEngine({ today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const data = createSyncedTestData(engine);
    renderToday(data);

    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    setOffline(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete: Morning run' }));

    expect(await screen.findByRole('button', { name: 'Completed: Morning run' })).toBeDefined();
    const pending = await engine.outbox.pending();
    expect(pending.map(entry => [entry.type, entry.payload['occurrenceId']])).toEqual([['quest.complete', OCCURRENCE]]);
    expect(server.batches).toHaveLength(0);
  });

  it('should post the queued completion once the connection returns', async () => {
    const { engine, server } = createTestEngine({
      today: TODAY,
      pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } }), page({ cursor: '2', domains: { quest_logs: [completedLogRow()] } })],
    });
    const data = createSyncedTestData(engine);
    renderToday(data);

    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    setOffline(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete: Morning run' }));
    await screen.findByRole('button', { name: 'Completed: Morning run' });

    setOffline(false);

    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toContain('quest.complete'));
    await waitFor(async () => expect(await engine.outbox.size()).toBe(0));
    expect(await screen.findByRole('button', { name: 'Completed: Morning run' })).toBeDefined();
  });

  it('should show a queued badge for unsynced rows', async () => {
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } }), page({ cursor: '2', domains: { quest_logs: [completedLogRow()] } })],
    });
    renderToday(createSyncedTestData(engine));

    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    expect(screen.queryByText('Queued')).toBeNull();
    setOffline(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete: Morning run' }));

    expect(await screen.findByText('Queued')).toBeDefined();

    setOffline(false);
    await waitFor(async () => expect(await engine.outbox.size()).toBe(0));
    await waitFor(() => expect(screen.queryByText('Queued')).toBeNull());
    expect(screen.getByRole('button', { name: 'Completed: Morning run' })).toBeDefined();
  });

  it('should clear the queued badge once the server acks even when the pull after it fails', async () => {
    let failPulls = false;
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })],
      fetchImpl: server => async (input, init) => (failPulls && String(input).includes('/sync/delta') ? new Response('{}', { status: 500 }) : server.fetchImpl(input, init)),
    });
    renderToday(createSyncedTestData(engine));

    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    setOffline(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete: Morning run' }));
    expect(await screen.findByText('Queued')).toBeDefined();

    failPulls = true;
    setOffline(false);
    await waitFor(() => expect(engine.getSnapshot().state).toBe('failed'));
    expect(await engine.outbox.size()).toBe(0);
    await waitFor(() => expect(screen.queryByText('Queued')).toBeNull());
  });

  it('should dispatch and flush a completion straight away while online', async () => {
    const { engine, server } = createTestEngine({ today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const data = createSyncedTestData(engine);
    renderToday(data);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    expect(await screen.findByRole('button', { name: 'Completed: Morning run' })).toBeDefined();
    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toContain('quest.complete'));
  });
});

type ToastOptions = { body?: string; action?: { label: string; onClick: () => void } } | undefined;

describe('undoing a quest outcome from Today', () => {
  afterEach(() => {
    setOffline(false);
    vi.restoreAllMocks();
  });

  async function skip(data: SyncedMemoirData, offline = false): Promise<void> {
    renderToday(data);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Morning run' }));
    if (offline) setOffline(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip with a reason' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip quest' }));
  }

  /** Serves the delta the server would hold after the last quest command it applied: the skipped log, or its tombstone once deleted. */
  function serverHoldingSkip(streaks: Record<string, unknown>[] = []): TestEngine {
    const skippedLog = { ...completedLogRow(), state: 'skipped', xpAwarded: 0, coinsAwarded: 0 };
    return createTestEngine({
      today: TODAY,
      fetchImpl: server => async (input, init) => {
        if (!String(input).includes('/sync/delta')) return server.fetchImpl(input, init);
        const types = server.batches.flatMap(batch => batch.types);
        const quests = { quests: [dailyQuestRow('q1', 'Morning run')], quest_streaks: streaks };
        const body: DeltaPage = types.includes('quest.deleteLog')
          ? page({ cursor: '3', domains: quests, tombstones: [{ domain: 'quest_logs', recordId: 'log-1', syncSeq: '3' }] })
          : types.includes('quest.skip')
            ? page({ cursor: '2', domains: { ...quests, quest_logs: [skippedLog] } })
            : page({ domains: quests });
        return deltaResponse(input, body, server.epoch);
      },
    });
  }

  it('should toast when completing from the row check without offering an undo', async () => {
    const success = vi.spyOn(toast, 'success');
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } }), page({ cursor: '2', domains: { quest_logs: [completedLogRow()] } })],
    });
    renderToday(createSyncedTestData(engine));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(success.mock.calls[0]?.[0]).toContain('Morning run completed.');
    expect((success.mock.calls[0]?.[1] as ToastOptions)?.action).toBeUndefined();
  });

  it('should undo a skip the server can fully revert', async () => {
    const success = vi.spyOn(toast, 'success');
    const { engine, server } = serverHoldingSkip();
    await skip(createSyncedTestData(engine));

    await waitFor(() => expect(success).toHaveBeenCalled());
    const undo = (success.mock.calls[0]?.[1] as ToastOptions)?.action;
    expect(undo?.label).toBe('Undo');
    expect(await screen.findByRole('button', { name: 'Skipped: Morning run' })).toBeDefined();

    undo?.onClick();

    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toEqual(['quest.skip', 'quest.deleteLog']));
    await waitFor(async () => expect(await engine.outbox.size()).toBe(0));
    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
  });

  it('should not offer undo for a skip the server has not confirmed', async () => {
    const neutral = vi.spyOn(toast, 'neutral');
    const { engine } = serverHoldingSkip();
    await skip(createSyncedTestData(engine), true);

    await waitFor(() => expect(neutral).toHaveBeenCalled());
    expect((neutral.mock.calls[0]?.[1] as ToastOptions)?.action).toBeUndefined();
  });

  it('should not offer undo for a skip that breaks a running streak', async () => {
    const success = vi.spyOn(toast, 'success');
    const { engine } = serverHoldingSkip([{ id: 's1', questId: 'q1', currentRunDays: 4, bestRunDays: 9, shieldsAvailable: 0, syncSeq: '1' }]);
    await skip(createSyncedTestData(engine));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect((success.mock.calls[0]?.[1] as ToastOptions)?.action).toBeUndefined();
  });

  it('should mark the row when a completion is rejected', async () => {
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } }), page({ cursor: '2' })],
      outcomes: batch => batch.commandIds.map(id => rejected(id, 'no', 'QST_006')),
    });
    renderToday(createSyncedTestData(engine));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    expect(await screen.findByText('Your last change to this quest wasn’t saved.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
  });
});
