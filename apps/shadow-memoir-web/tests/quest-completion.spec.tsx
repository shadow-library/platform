import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TodayScreen } from '@/features/today';
import { type DeltaPage, type SyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

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

  it('should dispatch and flush a completion straight away while online', async () => {
    const { engine, server } = createTestEngine({ today: TODAY, pages: [page({ domains: { quests: [dailyQuestRow('q1', 'Morning run')] } })] });
    const data = createSyncedTestData(engine);
    renderToday(data);

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    expect(await screen.findByRole('button', { name: 'Completed: Morning run' })).toBeDefined();
    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toContain('quest.complete'));
  });
});
