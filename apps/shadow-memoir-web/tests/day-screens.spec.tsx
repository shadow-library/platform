import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanningBoardScreen } from '@/features/planning';
import { QuestBuilderScreen, QuestEditorScreen, QuestListScreen } from '@/features/quests';
import { TodayScreen } from '@/features/today';
import { formatShortDate, MemoirEngine } from '@/lib/data';
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
    renderScreen(<QuestEditorScreen questId="morning-run" />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Morning run — 5 km' })).toBeDefined();
    expect(await screen.findByText('Rules on this quest')).toBeDefined();
    expect(await screen.findByText(/2 of 2 used in the last 7 days|0 of 2 used in the last 7 days/)).toBeDefined();
  });

  it('should show not enough history for a quest with no logs', async () => {
    const world = projectWorldState({ quests: [{ id: 'q-new', name: 'Fresh start', durationMin: 10, recurrence: { frequency: 'daily' }, active: true }] }, TODAY);
    const data = createMemoirTestData({ today: TODAY });
    data.provider = new MemoirEngine(world);

    renderScreen(<QuestEditorScreen questId="q-new" />, { value: data });
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
