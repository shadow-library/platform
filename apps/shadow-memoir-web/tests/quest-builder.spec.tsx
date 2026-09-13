import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestBuilderScreen } from '@/features/quests';

import { renderScreen } from './harness';

describe('QuestBuilderScreen', () => {
  it('should describe every-N-days drafts with N in the preview', async () => {
    renderScreen(<QuestBuilderScreen />, { today: '2026-08-22' });

    fireEvent.click(await screen.findByRole('radio', { name: 'Every N days' }));
    expect(await screen.findByText('Every 2 days — 4 times in the next 7 days.')).toBeDefined();

    const interval = screen.getByRole('spinbutton', { name: 'Repeat every N days' });
    fireEvent.change(interval, { target: { value: '5' } });
    expect(await screen.findByText('Every 5 days — 2 times in the next 7 days.')).toBeDefined();

    fireEvent.change(interval, { target: { value: '99' } });
    fireEvent.blur(interval);
    expect(interval).toHaveProperty('value', '30');
    expect(await screen.findByText('Every 30 days — 1 time in the next 7 days.')).toBeDefined();
  });

  it('should leave the preview without a cadence note for weekday drafts', async () => {
    renderScreen(<QuestBuilderScreen />, { today: '2026-08-22' });

    expect(await screen.findByRole('heading', { name: 'Effect on your week' })).toBeDefined();
    expect(screen.queryByText(/in the next 7 days/)).toBeNull();
  });
});
