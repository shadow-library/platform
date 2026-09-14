import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanningBoardScreen } from '@/features/planning';
import { formatDuration, MemoirEngine, type QuestDraft, shiftDate } from '@/lib/data';
import { projectWorldState, SyncedDataProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { createTestEngine, sharedBacking } from './sync-harness';

const TODAY = '2026-08-22';
const YESTERDAY = '2026-08-21';

const DAILY_QUEST = { id: 'q1', name: 'Morning run', durationMin: 30, recurrence: { frequency: 'daily' }, active: true };

const MON_TO_SAT_DRAFT: QuestDraft = {
  name: 'Read 20 pages',
  notes: null,
  startTimeMinutes: null,
  durationMinutes: 25,
  statAffinity: 'mind',
  strictness: 'routine',
  optionalStreakOptIn: false,
  recurrence: {
    frequency: 'weekly',
    interval: 1,
    daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    dayOfMonth: null,
    startDate: TODAY,
    end: { kind: 'never' },
    exceptions: [],
  },
  consequences: [],
  moduleLink: null,
  notification: { enabled: false, leadMinutes: 0 },
  healthThreshold: null,
  active: true,
};

describe('planning board (P2-03)', () => {
  it('should mark past days without logs as missed', async () => {
    const world = projectWorldState({ quests: [DAILY_QUEST] }, TODAY);
    const plan = await new MemoirEngine(world).getPlan({ scope: 'week', anchor: TODAY });

    const yesterday = plan.days.find(day => day.date === YESTERDAY);
    expect(yesterday?.items[0]?.state).toBe('missed');
    expect(yesterday?.items[0]?.meta).toBe('missed');

    const today = plan.days.find(day => day.isToday);
    expect(today?.items[0]?.state).toBe('upcoming');
  });

  it('should show overload above capacity', async () => {
    const world = projectWorldState({ quests: [{ ...DAILY_QUEST, name: 'Deep work', durationMin: 240 }] }, TODAY);
    const plan = await new MemoirEngine(world).getPlan({ scope: 'week', anchor: TODAY });

    const today = plan.days.find(day => day.isToday);
    expect(today?.overCapacity).toBe(true);
    expect(today?.loadPercent).toBeLessThanOrEqual(100);
    expect(today?.loadPercent).toBeGreaterThan(today?.capacityMarkPercent ?? 0);
  });

  it('should use the same load for the builder preview and the plan', async () => {
    const mondayQuest = { id: 'q2', name: 'Weekly planning', durationMin: 45, recurrence: { frequency: 'weekly', daysOfWeek: [1] }, active: true };
    const everyOtherDay: QuestDraft = { ...MON_TO_SAT_DRAFT, name: 'Stretch', recurrence: { ...MON_TO_SAT_DRAFT.recurrence, frequency: 'daily', interval: 2, daysOfWeek: [] } };

    const expectParity = async (draft: QuestDraft, minutes: number[]): Promise<void> => {
      const engine = new MemoirEngine(projectWorldState({ quests: [DAILY_QUEST, mondayQuest] }, TODAY));
      const preview = await engine.previewDraft(draft);
      await engine.dispatchCommand({ type: 'quest.create', draft });
      const plans = await Promise.all([TODAY, shiftDate(TODAY, 7)].map(anchor => engine.getPlan({ scope: 'week', anchor })));
      const planDays = plans.flatMap(plan => plan.days);

      expect(preview.days.map(day => day.minutes)).toEqual(minutes);
      for (const day of preview.days) {
        const planned = planDays.find(planDay => planDay.date === day.date);
        expect(planned?.loadSummary).toContain(`about ${formatDuration(day.minutes)}`);
        expect(planned).toMatchObject({ loadPercent: day.loadPercent, capacityMarkPercent: day.capacityMarkPercent, overCapacity: day.overCapacity });
      }
    };

    await expectParity(MON_TO_SAT_DRAFT, [30 + 25, 30, 30 + 45 + 25, 30 + 25, 30 + 25, 30 + 25, 30 + 25]);
    await expectParity(everyOtherDay, [30 + 25, 30, 30 + 45 + 25, 30, 30 + 25, 30, 30 + 25]);
  });

  it('should label preview days by date and name the heaviest one the same way', async () => {
    const deepWork = { ...DAILY_QUEST, name: 'Deep work', durationMin: 90, recurrence: { frequency: 'weekly', daysOfWeek: [2] } };
    const engine = new MemoirEngine(projectWorldState({ quests: [deepWork] }, TODAY));

    const preview = await engine.previewDraft({ ...MON_TO_SAT_DRAFT, durationMinutes: 90 });

    expect(preview.days.map(day => day.label)).toEqual(['Today', 'Tomorrow', 'Mon 24', 'Tue 25', 'Wed 26', 'Thu 27', 'Fri 28']);
    expect(preview.days.map(day => day.date)).toEqual(Array.from({ length: 7 }, (_, index) => shiftDate(TODAY, index)));
    expect(preview.overloadNote).toBe('Tue 25 would be the heaviest day — about 3h, above your usual load. This is a note, not a limit.');
  });

  it('should hide carry-over when nothing carried over', async () => {
    const world = projectWorldState({}, TODAY);
    const plan = await new MemoirEngine(world).getPlan({ scope: 'week', anchor: TODAY });
    expect(plan.carryOver).toBeNull();
  });

  it('should name the best run for a streak-eligible weekly quest missed yesterday, only on the current week', async () => {
    const weeklyQuest = { id: 'q1', name: 'Sunday review', durationMin: 30, recurrence: { frequency: 'weekly', daysOfWeek: [5] }, active: true };
    const world = projectWorldState({ quests: [weeklyQuest], quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 5 }] }, TODAY);
    const engine = new MemoirEngine(world);

    const currentWeek = await engine.getPlan({ scope: 'week', anchor: TODAY });
    expect(currentWeek.carryOver?.title).toBe('Yesterday left one commitment open');
    expect(currentWeek.carryOver?.body).toContain('Its best run, 5 days, stays in History.');
    expect(currentWeek.carryOver?.questId).toBe('q1');

    const nextWeek = await engine.getPlan({ scope: 'week', anchor: '2026-08-29' });
    expect(nextWeek.carryOver).toBeNull();
  });

  it('should not claim a streak ended when yesterday’s miss was shielded', async () => {
    const world = projectWorldState(
      {
        quests: [DAILY_QUEST],
        quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 5 }],
        quest_logs: [{ id: 'l1', questId: 'q1', date: YESTERDAY, state: 'missed', shielded: true }],
      },
      TODAY,
    );
    const engine = new MemoirEngine(world);

    const plan = await engine.getPlan({ scope: 'week', anchor: TODAY });
    expect(plan.carryOver?.body).not.toContain('best run');
    expect(plan.carryOver?.body).not.toContain('closed');
    expect(plan.carryOver?.body).not.toContain('ended');
  });

  it('should send plan.setLock to the server', async () => {
    const posted: { type: string; payload: Record<string, unknown> }[] = [];
    const { engine, server } = createTestEngine({
      today: TODAY,
      pages: [{ cursor: '1', hasMore: false, tombstones: [], domains: { quests: [DAILY_QUEST] } }],
      fetchImpl: fake => async (input, init) => {
        if (String(input).includes('/sync/commands')) posted.push(...(JSON.parse(String(init?.body)) as { commands: typeof posted }).commands);
        return fake.fetchImpl(input, init);
      },
    });
    await engine.start();
    const provider = new SyncedDataProvider(engine);
    const plan = await provider.getPlan({ scope: 'week', anchor: TODAY });
    const questIds = plan.days.find(day => day.isToday)?.items.map(item => item.questId) ?? [];

    const result = await provider.dispatchCommand({ type: 'plan.setLock', date: TODAY, locked: true, questIds });
    if (result.status !== 'applied') throw new Error(`expected an applied outcome, got ${result.status}`);
    expect(result.delivery).toMatchObject({ status: 'queued' });
    await engine.sync();

    expect(server.batches.flatMap(batch => batch.types)).toEqual(['plan.setLock']);
    expect(posted[0]).toMatchObject({ type: 'plan.setLock', payload: { locked: true, questIds } });
  });

  it('should keep today’s lock after reload', async () => {
    const backing = sharedBacking();
    const { engine } = createTestEngine({ backing, today: TODAY, status: () => 500 });
    await engine.hydrate();
    const provider = new SyncedDataProvider(engine);
    await provider.dispatchCommand({ type: 'plan.setLock', date: TODAY, locked: true, questIds: ['q1'] });

    const reloaded = createTestEngine({ backing, today: TODAY, status: () => 500 }).engine;
    await reloaded.hydrate();
    const reloadedProvider = new SyncedDataProvider(reloaded);
    await reloadedProvider.reproject();

    const plan = await reloadedProvider.getPlan({ scope: 'week', anchor: TODAY });
    expect(plan.days.find(day => day.isToday)?.locked).toBe(true);
  });

  it('should reject a lock for anything but today, or with nothing scheduled', async () => {
    const world = projectWorldState({ quests: [DAILY_QUEST] }, TODAY);
    const engine = new MemoirEngine(world);

    const wrongDay = await engine.dispatchCommand({ type: 'plan.setLock', date: YESTERDAY, locked: true, questIds: ['q1'] });
    expect(wrongDay.status).toBe('rejected');

    const empty = await engine.dispatchCommand({ type: 'plan.setLock', date: TODAY, locked: true, questIds: [] });
    expect(empty.status).toBe('rejected');
  });

  it('should hide the lock button in Month scope and show a visible reason when nothing is scheduled today', async () => {
    const mondayOnlyQuest = { id: 'q1', name: 'Monday planning', durationMin: 30, recurrence: { frequency: 'weekly', daysOfWeek: [1] }, active: true };
    const world = projectWorldState({ quests: [mondayOnlyQuest] }, TODAY);
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<PlanningBoardScreen />, { value: data });

    expect(await screen.findByText('Nothing is scheduled today.')).toBeDefined();
    const lockButton = screen.getByRole('button', { name: /lock today’s plan/i }) as HTMLButtonElement;
    expect(lockButton.disabled).toBe(true);

    fireEvent.click(await screen.findByRole('radio', { name: 'Month' }));
    expect(screen.queryByRole('button', { name: /lock today’s plan/i })).toBeNull();
  });
});
