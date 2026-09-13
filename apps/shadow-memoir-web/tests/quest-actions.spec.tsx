import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@shadow-library/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodayScreen } from '@/features/today';
import { type MemoirData, type OccurrenceState } from '@/lib/data';
import { type DeltaPage, type SyncedMemoirData, SyncEngineProvider, type WireCommandOutcome } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { applied, createSyncedTestData, createTestEngine, rejected, superseded, type TestEngineOptions } from './sync-harness';

const TODAY = '2026-08-22';

async function stateOf(data: MemoirData, questId: string): Promise<OccurrenceState> {
  const day = await data.provider.getDay(TODAY);
  const occurrence = day.occurrences.find(item => item.questId === questId);
  if (!occurrence) throw new Error(`${questId} is not scheduled on ${TODAY}`);
  return occurrence.state;
}

describe('TodayScreen quest actions', () => {
  let data: MemoirData;

  beforeEach(() => {
    data = createMemoirTestData({ today: TODAY });
  });

  it('should render today’s occurrences with their outcomes', async () => {
    renderScreen(<TodayScreen />, { value: data });
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeDefined();
    expect((await screen.findAllByText('Read 20 pages')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Completed: Morning run — 5 km' })).toBeDefined();
  });

  it('should complete an occurrence from its check control', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Read 20 pages' }));

    await waitFor(async () => expect(await stateOf(data, 'read-pages')).toBe('completed'));
  });

  it('should record a partial with a reason from the actions overlay', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Read 20 pages' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Partial' }));
    fireEvent.click(await screen.findByRole('button', { name: 'travel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save partial' }));

    await waitFor(async () => expect(await stateOf(data, 'read-pages')).toBe('partial'));
    const day = await data.provider.getDay(TODAY);
    expect(day.occurrences.find(item => item.questId === 'read-pages')?.reasonTag).toBe('travel');
  });

  it('should keep the streak when a partial is recorded', async () => {
    const before = (await data.provider.listQuests('active')).find(item => item.quest.id === 'read-pages');
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Read 20 pages' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Partial' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save partial' }));

    await waitFor(async () => expect(await stateOf(data, 'read-pages')).toBe('partial'));
    const after = (await data.provider.listQuests('active')).find(item => item.quest.id === 'read-pages');
    expect(after?.progress.currentStreakDays).toBe((before?.progress.currentStreakDays ?? 0) + 1);
  });

  it('should skip an occurrence from the actions overlay', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip with a reason' }));

    await waitFor(async () => expect(await stateOf(data, 'no-takeaway')).toBe('skipped'));
  });

  it('should leave editing inert while the plan is committed', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));

    const edit = await screen.findByRole('button', { name: 'Edit quest' });
    expect(edit.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/locked while this week’s plan is committed/)).toBeDefined();
  });

  it('should ask for a confirmation once the reschedule cap is reached', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

    expect(await screen.findByText(/2 reschedules used in the last 7 days/)).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Move it anyway' })).toBeDefined();
    expect(await stateOf(data, 'strength-session')).toBe('upcoming');
  });

  it('should record the move as a postpone once the owner confirms past the cap', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it anyway' }));

    await waitFor(async () => expect(await stateOf(data, 'strength-session')).toBe('postponed'));
  });

  it('should move an occurrence without a confirmation while inside the cap', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

    await waitFor(async () => expect(await stateOf(data, 'evening-stretch')).toBe('rescheduled'));
    expect(screen.queryByRole('button', { name: 'Move it anyway' })).toBeNull();
  });

  it('should return focus to the opener when an overlay closes', async () => {
    renderScreen(<TodayScreen />, { value: data });

    const trigger = await screen.findByRole('button', { name: 'Actions for Evening stretch' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole('button', { name: 'Complete' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('should return focus to the opener on Escape', async () => {
    renderScreen(<TodayScreen />, { value: data });

    const trigger = await screen.findByRole('button', { name: 'Actions for Evening stretch' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('should not restore focus to a detached opener', async () => {
    renderScreen(<TodayScreen />, { value: data });

    const trigger = await screen.findByRole('button', { name: 'Actions for Evening stretch' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole('button', { name: 'Complete' });
    trigger.remove();

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0] as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull());
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).toBe(document.body);
  });

  it('should reset the partial form for a different occurrence', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Read 20 pages' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Partial' }));
    fireEvent.change(await screen.findByLabelText('Reason note'), { target: { value: 'left early' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Partial' }));

    const note = (await screen.findByLabelText('Reason note')) as HTMLTextAreaElement;
    expect(note.value).toBe('');
  });
});

const SYNCED_TODAY = '2026-08-24';

function questRow(id: string, name: string): Record<string, unknown> {
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

function logRow(state: OccurrenceState): Record<string, unknown> {
  return {
    id: 'log-1',
    questId: 'q1',
    date: SYNCED_TODAY,
    state,
    xpAwarded: 0,
    coinsAwarded: 0,
    reasonTag: state === 'skipped' ? 'schedule_conflict' : null,
    reasonNote: null,
    rescheduledToMin: null,
    postponedToDate: null,
    statAffinity: 'body',
    performedAt: `${SYNCED_TODAY}T07:30:00.000Z`,
    createdAt: `${SYNCED_TODAY}T07:30:00.000Z`,
    syncSeq: '2',
  };
}

function page(overrides: Partial<DeltaPage>): DeltaPage {
  return { cursor: '1', hasMore: false, domains: {}, tombstones: [], ...overrides };
}

function syncedToday(
  outcome: (commandId: string) => WireCommandOutcome,
  afterFlush: DeltaPage = page({ domains: {} }),
  fetchImpl?: TestEngineOptions['fetchImpl'],
): SyncedMemoirData {
  const { engine } = createTestEngine({
    today: SYNCED_TODAY,
    pages: [page({ domains: { quests: [questRow('q1', 'Morning run'), questRow('q2', 'Evening stretch')] } }), afterFlush],
    outcomes: batch => batch.commandIds.map(outcome),
    fetchImpl,
  });
  const data = createSyncedTestData(engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <TodayScreen />
    </SyncEngineProvider>,
    { value: data },
  );
  return data;
}

describe('TodayScreen quest outcomes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('should not toast success when the server rejects', async () => {
    const success = vi.spyOn(toast, 'success');
    const warning = vi.spyOn(toast, 'warning');
    const data = syncedToday(id => rejected(id, 'This quest log is outside its 7-day edit window', 'QST_006'), page({ cursor: '2', domains: {} }));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith('Couldn’t complete ‘Morning run’ — undone: Entries older than 7 days can’t be changed.', undefined));
    expect(warning).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Mark complete: Morning run' })).toBeDefined();
    expect(data.engine.getSnapshot().notices).toEqual([]);
  });

  it('should keep the actions overlay open and name the quest when a completion is rejected', async () => {
    const warning = vi.spyOn(toast, 'warning');
    syncedToday(id => rejected(id, 'no', 'QST_006'), page({ cursor: '2', domains: {} }));

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Morning run' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith('Couldn’t complete ‘Morning run’ — undone: Entries older than 7 days can’t be changed.', undefined));
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDefined();
  });

  it('should warn when another device superseded the action', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const success = vi.spyOn(toast, 'success');
    syncedToday(id => superseded(id), page({ cursor: '2', domains: { quest_logs: [logRow('skipped')] } }));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    await waitFor(() => expect(warning).toHaveBeenCalledWith('‘Morning run’ changed on another device: Another device already recorded it as skipped.', undefined));
    expect(success).not.toHaveBeenCalled();
  });

  it('should toast success once the server applies the completion', async () => {
    const success = vi.spyOn(toast, 'success');
    const neutral = vi.spyOn(toast, 'neutral');
    syncedToday(id => applied(id), page({ cursor: '2', domains: { quest_logs: [logRow('completed')] } }));

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(success.mock.calls[0]?.[0]).toContain('Morning run');
    expect(neutral).not.toHaveBeenCalled();
  });

  it('should keep another quest’s actions available while one completion waits for the server', async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>(resolve => (answer = resolve));
    syncedToday(
      id => applied(id),
      page({ cursor: '2', domains: {} }),
      server => async (input, init) => {
        if (String(input).includes('/sync/commands')) await held;
        return server.fetchImpl(input, init);
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Morning run' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));

    expect((await screen.findByRole('button', { name: 'Complete' })).hasAttribute('disabled')).toBe(false);
    answer();
  });

  it('should fall back to generic superseded copy when the winner cannot be read back', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const data = syncedToday(id => superseded(id), page({ cursor: '2', domains: {} }));
    const trigger = await screen.findByRole('button', { name: 'Mark complete: Morning run' });
    vi.spyOn(data.provider, 'getDay').mockRejectedValue(new Error('mirror unreadable'));

    fireEvent.click(trigger);

    await waitFor(() => expect(warning).toHaveBeenCalledWith('‘Morning run’ changed on another device: Another device got there first, so this change wasn’t applied.', undefined));
  });

  it('should report a dispatch that throws instead of leaving an unhandled rejection', async () => {
    const danger = vi.spyOn(toast, 'danger');
    const data = syncedToday(id => applied(id));
    const trigger = await screen.findByRole('button', { name: 'Mark complete: Morning run' });
    vi.spyOn(data.provider, 'dispatchCommand').mockRejectedValue(new Error('store refused'));

    fireEvent.click(trigger);

    await waitFor(() => expect(danger).toHaveBeenCalledWith('Couldn’t complete ‘Morning run’: Something went wrong on our side.', undefined));
  });
});
