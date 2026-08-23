import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanningBoardScreen } from '@/features/planning';
import { QuestBuilderScreen, QuestEditorScreen, QuestListScreen } from '@/features/quests';
import { TodayScreen } from '@/features/today';

import { renderScreen } from './harness';

const TODAY = '2026-08-22';

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

  it('should state the reduced load calmly on a comeback week', async () => {
    renderScreen(<TodayScreen />, { today: TODAY, persona: 'recovery' });
    expect(await screen.findByText(/Comeback week/)).toBeDefined();
    expect(await screen.findByText(/no HP at stake today/)).toBeDefined();
  });

  it('should render the Planning Board with a week of days and its budgets', async () => {
    renderScreen(<PlanningBoardScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Planning Board' })).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Reschedule budget' })).toBeDefined();
    expect(await screen.findByText(/recorded as postpones with a reason/)).toBeDefined();
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
});
