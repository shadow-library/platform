import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestListScreen } from '@/features/quests';
import { type MemoirEngine, type QuestProgress } from '@/lib/data';
import { SyncEngineProvider } from '@/lib/sync';

import { createMemoirTestData, renderScreen } from './harness';
import { createSyncedTestData, createTestEngine } from './sync-harness';

const TODAY = '2026-08-22';

describe('QuestListScreen', () => {
  it('should show an empty state when no quest matches the search', async () => {
    renderScreen(<QuestListScreen />, { today: TODAY });

    fireEvent.click(await screen.findByRole('radio', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search quests'), { target: { value: 'zzzz' } });

    expect(await screen.findByText('No quests match “zzzz”')).toBeDefined();
    expect(screen.getByText('0 of 11 quests')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Weekly budget review')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText('Search quests'));
    expect(screen.getByText('11 quests in total')).toBeDefined();
  });

  it('should count search matches against the chosen filter', async () => {
    renderScreen(<QuestListScreen />, { today: TODAY });

    fireEvent.click(await screen.findByRole('radio', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search quests'), { target: { value: 'read' } });

    expect(await screen.findByText('1 of 11 quests')).toBeDefined();
  });

  it('should invite the first quest when the account has none', async () => {
    const { router } = renderScreen(<QuestListScreen />, { today: TODAY, persona: 'new', initialPath: '/quests' });

    fireEvent.click(await screen.findByRole('button', { name: 'Create your first quest' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/quests/new'));
    expect(screen.queryByText(/active quests/)).toBeNull();
  });

  it('should give every sparkline the same number of slots however few outcomes a quest has', async () => {
    const data = createMemoirTestData({ today: TODAY });
    const world = (data.provider as MemoirEngine).world;
    world.progress['budget-review'] = { ...(world.progress['budget-review'] as QuestProgress), recentOutcomes: ['completed', 'missed', 'completed', 'completed', 'skipped'] };
    renderScreen(<QuestListScreen />, { value: data });

    const weekly = (await screen.findByText('Weekly budget review')).closest('a') as HTMLElement;
    const daily = screen.getByText('Read 20 pages').closest('a') as HTMLElement;
    const slots = (row: HTMLElement): HTMLElement[] => Array.from(within(row).getByTestId('quest-spark').children) as HTMLElement[];

    expect(slots(weekly)).toHaveLength(slots(daily).length);
    expect(slots(weekly).filter(slot => slot.dataset['tone'] !== undefined)).toHaveLength(5);
    expect(
      slots(weekly)
        .slice(0, -5)
        .every(slot => slot.dataset['tone'] === undefined),
    ).toBe(true);
  });

  it('should show an error with retry instead of an empty library when the first sync fails', async () => {
    const { engine } = createTestEngine({ today: TODAY, status: () => 500 });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <QuestListScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.queryByText(/active quests/)).toBeNull();
  });
});
