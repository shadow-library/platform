import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@shadow-library/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodayScreen } from '@/features/today';
import { type MemoirData, MemoirEngine, type OccurrenceState } from '@/lib/data';
import { type DeltaPage, projectWorldState, type SyncedMemoirData, SyncEngineProvider, type WireCommandOutcome } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { withTimeZone } from './setup';
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

  afterEach(() => vi.restoreAllMocks());

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
    fireEvent.click(await screen.findByRole('button', { name: 'travel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save partial' }));

    await waitFor(async () => expect(await stateOf(data, 'read-pages')).toBe('partial'));
    const after = (await data.provider.listQuests('active')).find(item => item.quest.id === 'read-pages');
    expect(after?.progress.currentStreakDays).toBe((before?.progress.currentStreakDays ?? 0) + 1);
  });

  it('should ask for a reason before skipping', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(await screen.findByRole('button', { name: 'Skip quest' })).toBeDefined();
    expect(await screen.findByRole('button', { name: 'schedule conflict' })).toBeDefined();
    expect(await stateOf(data, 'no-takeaway')).toBe('upcoming');
  });

  it('should not touch a streak when skipping a recovery quest', async () => {
    const world = projectWorldState(
      { quests: [{ id: 'r1', name: 'Recovery walk', durationMin: 10, recurrence: { frequency: 'daily' }, strictness: 'recovery', active: true }] },
      TODAY,
    );
    data.provider = new MemoirEngine(world);
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Recovery walk' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(screen.getAllByText('Doesn’t touch a streak — this quest doesn’t keep one.').length).toBeGreaterThan(0);
  });

  it('should skip an occurrence once a reason is chosen and confirmed', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'schedule conflict' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip quest' }));

    await waitFor(async () => expect(await stateOf(data, 'no-takeaway')).toBe('skipped'));
    const day = await data.provider.getDay(TODAY);
    expect(day.occurrences.find(item => item.questId === 'no-takeaway')?.reasonTag).toBe('schedule_conflict');
  });

  it('should not claim a reason is kept private when a skip was given none', async () => {
    const success = vi.spyOn(toast, 'success');
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip quest' }));

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(success.mock.calls[0]?.[0]).toContain('No takeaway today skipped.');
    expect(success.mock.calls[0]?.[0]).not.toContain('reason');
  });

  it('should tell the owner a given skip reason stays private', async () => {
    const success = vi.spyOn(toast, 'success');
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'schedule conflict' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip quest' }));

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(success.mock.calls[0]?.[0]).toContain('The reason is only ever shown to you.');
  });

  it('should mark the skip reason as optional', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for No takeaway today' }));

    expect((await screen.findByRole('button', { name: 'Skip' })).textContent).toContain('A reason is optional');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText(/optional, used only in your own patterns/)).toBeDefined();
  });

  it('should disable saving a partial until a reason is chosen', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Read 20 pages' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Partial' }));

    expect((await screen.findByRole('button', { name: 'Save partial' })).hasAttribute('disabled')).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'travel' }));

    expect(screen.getByRole('button', { name: 'Save partial' }).hasAttribute('disabled')).toBe(false);
  });

  it('should confirm a postpone', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Postpone to tomorrow' }));

    expect(await screen.findByRole('button', { name: 'Postpone' })).toBeDefined();
    expect(screen.getAllByText(/A held shield bridges the break/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spends 1 HP when the day closes.').length).toBeGreaterThan(0);
    expect(await stateOf(data, 'move-steps')).toBe('upcoming');

    fireEvent.click(await screen.findByRole('button', { name: 'Postpone' }));

    await waitFor(async () => expect(await stateOf(data, 'move-steps')).toBe('postponed'));
  });

  it('should hide completion actions for resolved occurrences', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Morning run — 5 km' }));

    const complete = await screen.findByRole('button', { name: 'Complete' });
    expect(complete.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('Already recorded as kept.').length).toBeGreaterThan(0);
  });

  it('should allow completing a rescheduled occurrence', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        await waitFor(async () => expect(await stateOf(data, 'move-steps')).toBe('rescheduled'));

        fireEvent.click(await screen.findByRole('button', { name: 'Mark complete: Move 8,000 steps' }));

        await waitFor(async () => expect(await stateOf(data, 'move-steps')).toBe('completed'));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should disable reschedule for a strictness that never allows it', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));

    const reschedule = await screen.findByRole('button', { name: 'Reschedule to another time' });
    expect(reschedule.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Reschedule doesn’t apply to this strictness.')).toBeDefined();
  });

  it('should disable reschedule for an occurrence already moved today', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        await waitFor(async () => expect(await stateOf(data, 'move-steps')).toBe('rescheduled'));

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));

        const reschedule = await screen.findByRole('button', { name: 'Reschedule to another time' });
        expect(reschedule.hasAttribute('disabled')).toBe(true);
        expect(screen.getByText('Already moved once today.')).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should keep quest details reachable while the plan is locked', async () => {
    const { router } = renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));

    const details = await screen.findByRole('button', { name: 'Quest details' });
    expect(details.hasAttribute('disabled')).toBe(false);

    fireEvent.click(details);

    await waitFor(() => expect(router.state.location.pathname).toBe('/quests/strength-session'));
  });

  it('should warn that postponing a locked quest breaks today’s plan', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));

    expect((await screen.findByRole('button', { name: 'Postpone to tomorrow' })).textContent).toContain('Postponing breaks today’s locked plan');
    expect(screen.getByRole('button', { name: 'Skip' }).textContent).not.toContain('locked plan');
  });

  it('should price a break from the day’s synced intensity rather than the account’s', async () => {
    const world = projectWorldState(
      {
        account: [{ level: 2, hpToday: 5, hpMax: 8, intensityMode: 'high_intensity' }],
        quests: [{ id: 'q1', name: 'Evening stretch', durationMin: 10, startTimeMin: 1200, recurrence: { frequency: 'daily' }, strictness: 'routine', active: true }],
        quest_streaks: [{ questId: 'q1', currentRunDays: 9, bestRunDays: 9, shieldsAvailable: 1 }],
        daily_states: [{ date: TODAY, intensityMode: 'low_intensity' }],
      },
      TODAY,
    );
    data.provider = new MemoirEngine(world);
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Postpone to tomorrow' }));

    expect(screen.getAllByText(/A held shield bridges the break/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('No HP is spent — gentle intensity.').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Spends \d HP/)).toBeNull();
  });

  it('should still charge HP for a shielded break on a standard day', async () => {
    const world = projectWorldState(
      {
        quests: [{ id: 'q1', name: 'Evening stretch', durationMin: 10, startTimeMin: 1200, recurrence: { frequency: 'daily' }, strictness: 'anchor', active: true }],
        quest_streaks: [{ questId: 'q1', currentRunDays: 9, bestRunDays: 9, shieldsAvailable: 1 }],
        daily_states: [{ date: TODAY, intensityMode: 'standard' }],
      },
      TODAY,
    );
    data.provider = new MemoirEngine(world);
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(screen.getAllByText(/A held shield bridges the break/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spends 1 HP when the day closes.').length).toBeGreaterThan(0);
  });

  it('should hedge the break cost offline when no day snapshot or account has synced', async () => {
    data.provider = new MemoirEngine(
      projectWorldState({ quests: [{ id: 'q1', name: 'Evening stretch', durationMin: 10, recurrence: { frequency: 'daily' }, active: true }] }, TODAY),
    );
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Evening stretch' }));

    expect((await screen.findByRole('button', { name: 'Skip' })).textContent).toContain('May spend HP when the day closes, depending on your intensity.');
  });

  it('should ask for a confirmation once the reschedule cap is reached', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        expect(await screen.findByText(/2 reschedules used in the last 7 days/)).toBeDefined();
        expect(await screen.findByRole('button', { name: 'Move it anyway' })).toBeDefined();
        expect(await stateOf(data, 'strength-session')).toBe('upcoming');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should record the move as a postpone once the owner confirms past the cap', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it anyway' }));

        await waitFor(async () => expect(await stateOf(data, 'strength-session')).toBe('postponed'));
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should move an occurrence without a confirmation while inside the cap', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        await waitFor(async () => expect(await stateOf(data, 'move-steps')).toBe('rescheduled'));
        expect(screen.queryByRole('button', { name: 'Move it anyway' })).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should not promise a kept streak when the reschedule cap is already reached', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
        expect((await screen.findByRole('button', { name: 'Reschedule to another time' })).textContent).toContain('recorded as a postpone');
        fireEvent.click(screen.getByRole('button', { name: 'Reschedule to another time' }));

        expect(await screen.findByText('Reached — this move is recorded as a postpone')).toBeDefined();
        expect(screen.queryByText('Kept — a move inside the cap does not break it')).toBeNull();
        expect(screen.getAllByText(/Postponing breaks today’s locked plan/).length).toBeGreaterThan(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should keep the streak promise for a move inside the reschedule cap', async () => {
    renderScreen(<TodayScreen />, { value: data });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Move 8,000 steps' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));

    expect(await screen.findByText('Kept — a move inside the cap does not break it')).toBeDefined();
    expect(screen.queryByText('Reached — this move is recorded as a postpone')).toBeNull();
  });

  it('should warn that moving past the cap breaks today’s locked plan', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        const confirm = await screen.findByRole('dialog', { name: /2 reschedules used in the last 7 days/ });
        expect(confirm.textContent).toContain('Postponing breaks today’s locked plan');
        expect(confirm.textContent).toContain('A postpone, so the history stays honest');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should reject a reschedule into the past', async () => {
    await withTimeZone('Europe/Oslo', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-22T18:00:00.000Z'));
      try {
        renderScreen(<TodayScreen />, { value: data });

        fireEvent.click(await screen.findByRole('button', { name: 'Actions for Strength session' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Reschedule to another time' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Move it' }));

        expect(await screen.findByText('Pick a time that hasn’t passed yet.')).toBeDefined();
        expect(await stateOf(data, 'strength-session')).toBe('upcoming');
      } finally {
        vi.useRealTimers();
      }
    });
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
