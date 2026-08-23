import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { TodayScreen } from '@/features/today';
import { type MemoirData, type OccurrenceState } from '@/lib/data';

import { createMemoirTestData, renderScreen } from './harness';

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
});
