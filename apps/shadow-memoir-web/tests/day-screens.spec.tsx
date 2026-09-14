import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlanningBoardScreen } from '@/features/planning';
import { QuestBuilderScreen, QuestDetailScreen, QuestListScreen } from '@/features/quests';
import { TodayScreen } from '@/features/today';
import { formatShortDate, MemoirEngine } from '@/lib/data';
import { formatLocalDate } from '@/lib/format';
import { type DeltaPage, projectWorldState, SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const TODAY = '2026-08-22';

const WEEKLY_CROWN = { label: 'this week', cadence: 'weekly', periodStart: '2026-08-17', closesOn: '2026-08-23', dayIndex: 6, dayCount: 7, keptPercent: 86 };

function renderSyncedToday(account: Record<string, unknown>): void {
  const page: DeltaPage = {
    cursor: '1',
    hasMore: false,
    tombstones: [],
    domains: {
      account: [{ level: 8, totalXp: '1231', xpIntoLevel: 104, xpForNextLevel: 339, coins: 40, hpToday: 2, hpMax: 5, warmthState: 'cold', crown: WEEKLY_CROWN, ...account }],
      quests: [{ id: 'q1', name: 'Morning run', durationMin: 30, recurrence: { frequency: 'daily' }, active: true }],
    },
  };
  const { engine } = createTestEngine({ today: TODAY, pages: [page] });
  const data = createSyncedTestData(engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <TodayScreen />
    </SyncEngineProvider>,
    { value: data },
  );
}

describe('day group screens', () => {
  it('should render the Today screen with its hero summary and quest list', async () => {
    renderScreen(<TodayScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeDefined();
    expect(await screen.findByLabelText('HP 4 of 5')).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Streaks' })).toBeDefined();
  });

  it('should not offer a first quest when a quest starts later this week', async () => {
    const data = createMemoirTestData({ today: '2026-09-13', persona: 'new' });
    await data.provider.dispatchCommand({
      type: 'quest.create',
      draft: {
        name: 'Walk 20 minutes',
        notes: null,
        startTimeMinutes: null,
        durationMinutes: 10,
        statAffinity: 'body',
        strictness: 'goal',
        optionalStreakOptIn: false,
        recurrence: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
          dayOfMonth: null,
          startDate: '2026-09-13',
          end: { kind: 'never' },
          exceptions: [],
        },
        consequences: [],
        moduleLink: null,
        notification: { enabled: false, leadMinutes: 0 },
        healthThreshold: null,
        active: true,
      },
    });

    renderScreen(<TodayScreen />, { value: data });

    expect(await screen.findByRole('heading', { name: 'Nothing is due today' })).toBeDefined();
    expect(screen.getByText('Walk 20 minutes is next · Tomorrow.')).toBeDefined();
    expect(screen.queryByText('Your first day is empty on purpose')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create your first quest' })).toBeNull();
  });

  it('should name the next scheduled day when nothing is due until next week or later', async () => {
    renderTodayOver(
      engineOver({ quests: [questRow('q1', 'Pay rent', { recurrence: { frequency: 'monthly', startDate: '2026-01-01', pattern: { kind: 'day_of_month', dayOfMonth: 15 } } })] }),
    );

    expect(await screen.findByRole('heading', { name: 'Nothing is due today' })).toBeDefined();
    expect(screen.getByText(`Pay rent is next · ${formatLocalDate('2026-09-15', { year: false })}.`)).toBeDefined();
  });

  it('should name the weekday when the next quest falls later this week', async () => {
    renderTodayOver(engineOver({ quests: [questRow('q1', 'Review week', { recurrence: { frequency: 'weekly', startDate: '2026-08-01', daysOfWeek: [3] } })] }));

    expect(await screen.findByText('Review week is next · Wednesday.')).toBeDefined();
  });

  it('should say no active quest is scheduled again when every series has ended', async () => {
    renderTodayOver(
      engineOver({ quests: [questRow('q1', 'Spring cleaning', { recurrence: { frequency: 'daily', startDate: '2026-08-01', end: { kind: 'until', date: '2026-08-21' } } })] }),
    );

    expect(await screen.findByRole('heading', { name: 'Nothing is due today' })).toBeDefined();
    expect(screen.getByText('None of your active quests is scheduled again in the next year.')).toBeDefined();
    expect(screen.queryByText('Your first day is empty on purpose')).toBeNull();
  });

  it('should invite a first quest when the day has no occurrences', async () => {
    renderScreen(<TodayScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByText('Your first day is empty on purpose')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create your first quest' })).toBeDefined();
  });

  it('should show the recovery alert for a recovery persona', async () => {
    renderSyncedToday({ persona: 'recovery', comeback: { armed: true, firedOn: null }, timezone: 'UTC' });

    expect(await screen.findByText('A recovery quest is on today')).toBeDefined();
    expect(screen.getByRole('link', { name: 'See recovery choices' }).getAttribute('href')).toBe('/hero/recovery');
    expect(screen.getByText('returning')).toBeDefined();
  });

  it('should not show the recovery alert for an active persona', async () => {
    renderSyncedToday({ persona: 'active', comeback: null, timezone: 'UTC' });

    expect(await screen.findByLabelText('HP 2 of 5')).toBeDefined();
    expect(screen.queryByText('A recovery quest is on today')).toBeNull();
    expect(screen.queryByText('Welcome back')).toBeNull();
  });

  it('should show the displayed title on the hero card', async () => {
    renderSyncedToday({ persona: 'active', displayedTitleId: 'anchor_holder' });

    expect(await screen.findByText('Anchor Holder')).toBeDefined();
    expect(screen.getByText('104 / 339')).toBeDefined();
    expect(screen.getByText('235 XP to level 9')).toBeDefined();
    expect(screen.getByText(/day 6 of 7 · 86% kept/)).toBeDefined();
    expect(screen.queryByText(/250/)).toBeNull();
  });

  it('should show the highest level instead of an experience target', async () => {
    renderSyncedToday({ level: 999, xpIntoLevel: 71, xpForNextLevel: 0 });

    expect(await screen.findByText('Highest level reached')).toBeDefined();
    expect(screen.queryByText(/XP to level 1000/)).toBeNull();
  });

  it('should show the plain level when the account row has no level curve', async () => {
    renderSyncedToday({ level: 4, xpIntoLevel: undefined, xpForNextLevel: undefined, crown: { ...WEEKLY_CROWN, cadence: 'daily', label: 'today', dayCount: 1, dayIndex: 1 } });

    expect(await screen.findByText('4')).toBeDefined();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Highest level reached')).toBeNull();
    expect(screen.getByText((_, element) => element?.textContent === 'Crown · today · 86% kept')).toBeDefined();
    expect(screen.queryByText(/closes today/)).toBeNull();
  });

  it('should render a threshold quest from the server shape', async () => {
    const world = projectWorldState(
      {
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        quests: [
          {
            id: 'q-threshold',
            name: 'Move 8,000 steps',
            durationMin: 0,
            recurrence: { frequency: 'daily' },
            healthThreshold: { metricId: '501', value: 8000, comparison: 'gte' },
            active: true,
          },
        ],
      },
      TODAY,
    );
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<TodayScreen />, { value: data });
    expect((await screen.findAllByText('Move 8,000 steps')).length).toBeGreaterThan(0);
    expect(await screen.findByText(/0 of 8,000/)).toBeDefined();
  });

  it('should render the Planning Board with a week of days and its budgets', async () => {
    renderScreen(<PlanningBoardScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Planning Board' })).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Reschedule budget' })).toBeDefined();
    expect(await screen.findByText(/Each quest can move 2 times in any 7 days/)).toBeDefined();
    expect(screen.queryByText(/recorded as skips/)).toBeNull();
    expect(screen.queryByText(/Crown period ·/)).toBeNull();
  });

  it('should show the real crown and a formatted heaviest day on the Planning Board', async () => {
    const world = projectWorldState(
      {
        account: [{ level: 3, crown: WEEKLY_CROWN }],
        quests: [{ id: 'q-1', name: 'Morning walk', durationMin: 40, recurrence: { frequency: 'daily' }, active: true }],
      },
      TODAY,
    );
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<PlanningBoardScreen />, { value: data });
    expect(await screen.findByRole('heading', { name: 'Current crown · this week' })).toBeDefined();
    expect(screen.getByText(/Day 6 of 7 · 86% of the crown kept so far/)).toBeDefined();
    expect(screen.getByText(`Heaviest day ${formatShortDate('2026-08-17')}`)).toBeDefined();
  });

  it('should switch the Planning Board to a month view', async () => {
    renderScreen(<PlanningBoardScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('radio', { name: 'Month' }));
    expect(await screen.findByText('skipped or missed')).toBeDefined();
  });

  it('should render the quest library and filter it', async () => {
    renderScreen(<QuestListScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Quests' })).toBeDefined();
    expect(await screen.findByText('Weekly budget review')).toBeDefined();

    fireEvent.click(screen.getByRole('radio', { name: 'Inactive' }));
    expect(await screen.findByText('Cold shower')).toBeDefined();
    expect(await screen.findByText('Inactive quests keep their history')).toBeDefined();
  });

  it('should render the quest builder with its strictness rules', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'New quest' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Anchor/ })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create quest' }).hasAttribute('disabled')).toBe(true);
  });

  it('should enable creation once the quest is named', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });
    fireEvent.change(await screen.findByLabelText('Quest name'), { target: { value: 'Read 20 pages' } });
    expect(screen.getByRole('button', { name: 'Create quest' }).hasAttribute('disabled')).toBe(false);
  });

  it('should render a quest with its rules and history', async () => {
    renderScreen(<QuestDetailScreen questId="morning-run" />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Morning run — 5 km' })).toBeDefined();
    expect(await screen.findByText('Rules on this quest')).toBeDefined();
    expect(await screen.findByText('0 of 2 used in the last 7 days')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).toBeNull();
  });

  it('should offer a direct reschedule button for an eligible occurrence', async () => {
    renderScreen(<QuestDetailScreen questId="strength-session" />, { today: TODAY });

    fireEvent.click(await screen.findByRole('button', { name: 'Reschedule' }));

    expect(await screen.findByRole('heading', { name: /Reschedule — Strength session/ })).toBeDefined();
  });

  it('should not offer to navigate to the quest details page it is already showing', async () => {
    renderScreen(<QuestDetailScreen questId="morning-run" />, { today: TODAY, initialPath: '/quests/morning-run' });

    fireEvent.click(await screen.findByRole('button', { name: 'Today’s actions' }));

    expect(screen.queryByRole('button', { name: 'Quest details' })).toBeNull();
  });

  it('should show not found for an unknown quest id', async () => {
    renderScreen(<QuestDetailScreen questId="does-not-exist" />, { today: TODAY });
    expect(await screen.findByText('This quest isn’t here')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Back to Quests' })).toBeDefined();
  });

  it('should prefill the builder when duplicating', async () => {
    const search = [
      `duplicateName=${encodeURIComponent('Strength session')}`,
      'duplicateStatAffinity=body',
      'duplicateStrictness=anchor',
      'duplicateStartTimeMinutes=1080',
      'duplicateDurationMinutes=50',
    ].join('&');
    renderScreen(<QuestBuilderScreen />, { today: TODAY, initialPath: `/quests/new?${search}` });

    expect(((await screen.findByLabelText('Quest name')) as HTMLInputElement).value).toBe('Strength session');
    expect(screen.getByRole('button', { name: /Anchor/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('should show not enough history for a quest with no logs', async () => {
    const world = projectWorldState({ quests: [{ id: 'q-new', name: 'Fresh start', durationMin: 10, recurrence: { frequency: 'daily' }, active: true }] }, TODAY);
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<QuestDetailScreen questId="q-new" />, { value: data });
    expect(await screen.findByText('Not enough history yet')).toBeDefined();
  });

  it('should show nothing yet today when no action was logged', async () => {
    const world = projectWorldState({ quests: [{ id: 'q-1', name: 'Morning walk', durationMin: 10, recurrence: { frequency: 'daily' }, active: true }] }, TODAY);
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<TodayScreen />, { value: data });
    expect(await screen.findByText('Nothing yet today.')).toBeDefined();
  });
});

function questRow(id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name, durationMin: 20, startTimeMin: 420, strictness: 'routine', recurrence: { frequency: 'daily' }, active: true, ...extra };
}

function logRow(questId: string, date: string, state: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: `${questId}-${date}`, questId, date, state, xpAwarded: 0, coinsAwarded: 0, createdAt: `${date}T08:00:00.000Z`, ...extra };
}

function engineOver(rows: Parameters<typeof projectWorldState>[0]): MemoirEngine {
  return new MemoirEngine(projectWorldState(rows, TODAY));
}

function renderTodayOver(engine: MemoirEngine): void {
  const data = createMemoirTestData({ today: TODAY });
  data.provider = engine;
  renderScreen(<TodayScreen />, { value: data });
}

describe('Today screen', () => {
  afterEach(() => vi.useRealTimers());

  it('should show a skeleton until the first sync', async () => {
    let open: () => void = () => undefined;
    const opened = new Promise<void>(resolve => (open = resolve));
    const { engine } = createTestEngine({
      today: TODAY,
      pages: [{ cursor: '1', hasMore: false, tombstones: [], domains: { account: [{ level: 8, hpToday: 2, hpMax: 5 }], quests: [questRow('q1', 'Morning run')] } }],
      fetchImpl: server => async (input, init) => {
        if (String(input).includes('/sync/delta')) await opened;
        return server.fetchImpl(input, init);
      },
    });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <TodayScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeDefined();
    expect(screen.queryByText('Your first day is empty on purpose')).toBeNull();
    expect(screen.queryByLabelText(/^HP /)).toBeNull();

    open();
    expect(await screen.findByLabelText('HP 2 of 5')).toBeDefined();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  it('should show an error when the first sync fails', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const { engine } = createTestEngine({ today: TODAY, status: () => 500 });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <TodayScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.queryByText('Your first day is empty on purpose')).toBeNull();
    expect(screen.queryByText('Create your first quest')).toBeNull();
  });

  it('should title a quick log value only while it is clipped', async () => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          callbacks.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    try {
      renderScreen(<TodayScreen />, { today: TODAY });
      const value = (await screen.findByRole('link', { name: /^Steps/ })).lastElementChild as HTMLElement;
      const box = { scrollWidth: 72, clientWidth: 72 };
      Object.defineProperty(value, 'scrollWidth', { configurable: true, get: () => box.scrollWidth });
      Object.defineProperty(value, 'clientWidth', { configurable: true, get: () => box.clientWidth });

      expect(value.hasAttribute('title')).toBe(false);

      box.scrollWidth = 123;
      act(() => callbacks.forEach(callback => callback()));
      expect(value.getAttribute('title')).toBe(value.textContent);

      box.scrollWidth = 72;
      act(() => callbacks.forEach(callback => callback()));
      expect(value.hasAttribute('title')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should render large HP as a compact meter', async () => {
    renderSyncedToday({ hpToday: 99, hpMax: 99 });

    const meter = await screen.findByLabelText('HP 99 of 99');
    expect(screen.getByText('HP 99 of 99')).toBeDefined();
    expect(meter.querySelector('[data-hp-meter="bar"]')).not.toBeNull();
    expect(meter.querySelectorAll('[data-filled]')).toHaveLength(0);
  });

  it('should hide HP for an account that has none yet', async () => {
    renderSyncedToday({ hpToday: 0, hpMax: 0 });

    expect(await screen.findByText(/Crown · /)).toBeDefined();
    expect(screen.queryByLabelText(/^HP /)).toBeNull();
  });

  it('should show threshold progress from metric entries', async () => {
    renderTodayOver(
      engineOver({
        metrics: [{ id: '501', name: 'Steps', isHealth: true }],
        metric_entries: [
          { id: '1', metricId: '501', date: TODAY, value: '3000', source: 'manual', createdAt: `${TODAY}T07:00:00.000Z` },
          { id: '2', metricId: '501', date: TODAY, value: '5200', source: 'manual', createdAt: `${TODAY}T12:00:00.000Z` },
          { id: '3', metricId: '501', date: TODAY, value: '9999', source: 'quest_log', createdAt: `${TODAY}T13:00:00.000Z` },
          { id: '4', metricId: '501', date: '2026-08-21', value: '12000', source: 'manual', createdAt: '2026-08-21T20:00:00.000Z' },
        ],
        quests: [questRow('q-threshold', 'Move 8,000 steps', { healthThreshold: { metricId: '501', value: 8000, comparison: 'gte' } })],
      }),
    );

    expect(await screen.findByText(/5,200 of 8,000/)).toBeDefined();
    expect(screen.queryByText(/Target reached/)).toBeNull();
  });

  it('should not count partials as done', async () => {
    renderTodayOver(
      engineOver({
        quests: [questRow('q1', 'Morning run'), questRow('q2', 'Read 20 pages'), questRow('q3', 'Evening stretch')],
        quest_logs: [logRow('q1', TODAY, 'completed'), logRow('q2', TODAY, 'partial')],
      }),
    );

    expect(await screen.findByText('1 of 3 done · 1 partial')).toBeDefined();
  });

  it('should hold the end-of-day summary until the wake window closes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const engine = engineOver({
      account: [{ level: 2, hpToday: 4, hpMax: 5, scheduleEndMin: 1320 }],
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Read 20 pages')],
      quest_logs: [logRow('q1', TODAY, 'completed'), logRow('q2', TODAY, 'partial')],
    });

    vi.setSystemTime(new Date(2026, 7, 22, 14, 30));
    expect((await engine.getDay(TODAY)).summary).toBeNull();

    vi.setSystemTime(new Date(2026, 7, 22, 22, 15));
    expect((await engine.getDay(TODAY)).summary?.detail).toBe('1 of 2 quests completed, 1 partial.');
  });

  it('should keep a rescheduled occurrence in Coming up at its new time', async () => {
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Late walk', { startTimeMin: 1260 })],
      quest_logs: [logRow('q1', TODAY, 'rescheduled', { rescheduledToMin: 1200 })],
    });

    const upcoming = (await engine.getDay(TODAY)).upcoming;
    expect(upcoming.slice(0, 2)).toEqual([
      { id: `q1:${TODAY}`, when: '20:00', title: 'Morning run', meta: 'Today · moved from 07:00' },
      { id: `q2:${TODAY}`, when: '21:00', title: 'Late walk', meta: 'Today' },
    ]);
  });

  it('should leave the crown out of the hero card and Coming up for an account without quests', async () => {
    renderTodayOver(engineOver({ account: [{ level: 1, hpToday: 0, hpMax: 0 }] }));

    expect(await screen.findByText('Nothing else is scheduled yet.')).toBeDefined();
    expect(screen.queryByText('Crown closes')).toBeNull();
    expect(screen.queryByText(/Crown · /)).toBeNull();
    expect(screen.getByText(/Momentum/)).toBeDefined();
    expect(screen.getByText('No streaks yet. One starts the first day you keep a quest.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Log a side quest' }).getAttribute('href')).toBe('/log/sidequests');
  });

  it('should date a closed streak from its first unshielded break, not the daily misses after it', async () => {
    const away = Array.from({ length: 11 }, (_, index) => logRow('q1', `2026-08-${String(11 + index).padStart(2, '0')}`, 'missed'));
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run')],
      quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 41, shieldsAvailable: 0 }],
      quest_logs: [logRow('q1', '2026-08-08', 'completed'), logRow('q1', '2026-08-09', 'skipped', { shielded: true }), logRow('q1', '2026-08-10', 'missed'), ...away],
    });

    const [streak] = (await engine.getDay(TODAY)).streaks;
    expect(streak?.label).toBe('ended at 41');
    expect(streak?.note).toBe('Closed 12 days ago. The record stays.');
  });

  it('should date a closed streak from the first scheduled day after the last kept one when no break was logged', async () => {
    const engine = engineOver({
      quests: [questRow('q1', 'Morning run')],
      quest_streaks: [{ questId: 'q1', currentRunDays: 0, bestRunDays: 41, shieldsAvailable: 0 }],
      quest_logs: [logRow('q1', '2026-08-07', 'completed'), logRow('q1', '2026-08-09', 'partial')],
    });

    expect((await engine.getDay(TODAY)).streaks[0]?.note).toBe('Closed 12 days ago. The record stays.');
  });

  it('should read a past rescheduled occurrence as missed on the plan', async () => {
    const engine = engineOver({ quests: [questRow('q1', 'Morning run')], quest_logs: [logRow('q1', '2026-08-21', 'rescheduled', { rescheduledToMin: 1200 })] });

    const plan = await engine.getPlan({ scope: 'week', anchor: TODAY });
    expect(plan.days.find(day => day.date === '2026-08-21')?.items[0]?.state).toBe('missed');
  });

  it('should leave HP to the day close when a quest is skipped', async () => {
    const engine = engineOver({
      account: [{ level: 2, hpToday: 4, hpMax: 5 }],
      quests: [questRow('q1', 'Morning run'), questRow('q2', 'Recovery walk', { strictness: 'recovery' })],
      quest_streaks: [
        { questId: 'q1', currentRunDays: 5, bestRunDays: 5, shieldsAvailable: 1 },
        { questId: 'q2', currentRunDays: 0, bestRunDays: 0, shieldsAvailable: 1 },
      ],
    });

    await engine.dispatchCommand({ type: 'quest.skip', occurrenceId: `q1:${TODAY}` });
    await engine.dispatchCommand({ type: 'quest.skip', occurrenceId: `q2:${TODAY}` });

    const day = await engine.getDay(TODAY);
    expect(day.hero.hp).toBe(4);
    expect(day.occurrences.find(item => item.questId === 'q1')).toMatchObject({ streakDays: 5, shields: 0 });
    expect(day.occurrences.find(item => item.questId === 'q2')).toMatchObject({ shields: 1 });
  });

  it('should describe a one-day-a-week quest in the singular', async () => {
    const engine = engineOver({ quests: [questRow('q1', 'Weekly review', { recurrence: { frequency: 'weekly', daysOfWeek: [6] }, durationMin: 30 })] });

    expect((await engine.getQuest('q1')).loadSummary).toBe('About 30m on the days it runs, 1 day a week.');
  });
});
