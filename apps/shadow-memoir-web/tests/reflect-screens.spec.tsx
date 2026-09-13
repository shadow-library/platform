import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiScreen } from '@/features/ai';
import { HistoryScreen } from '@/features/history';
import { InsightsScreen } from '@/features/insights';
import { WeeklyReviewScreen } from '@/features/review';

import { renderScreen } from './harness';

const TODAY = '2026-08-22';

async function passTheConsentGate(): Promise<void> {
  fireEvent.click(await screen.findByRole('switch', { name: /Journal reflections and reasons/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
}

function stubNarrowViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 999px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('History screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should group the feed by day and open a record', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'History' })).toBeDefined();
    expect(await screen.findByText(/^Today · /)).toBeDefined();

    fireEvent.click((await screen.findAllByText(/^Morning run — 5 km · /))[0] as HTMLElement);
    expect(await screen.findByText('Outcome')).toBeDefined();
  });

  it('should filter the feed to one record type', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    expect(await screen.findAllByText(/^Morning run — 5 km · /)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Expense' }));
    expect(await screen.findByText(/matching records$/)).toBeDefined();
    expect(screen.queryByText(/^Morning run — 5 km · /)).toBeNull();
  });

  it('should read a grant out of the hero feed', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('button', { name: 'Hero' }));

    fireEvent.click(await screen.findByText('Achievement — Level 14 reached'));
    expect(await screen.findByText('Never removed — a grant once earned is kept')).toBeDefined();
  });

  it('should stay calm when a filter matches nothing', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.change(await screen.findByLabelText('Search all records'), { target: { value: 'nothing at all' } });
    expect(await screen.findByText('Nothing matches that yet')).toBeDefined();
  });

  it('should move focus to the detail when a history row is selected on narrow layouts', async () => {
    stubNarrowViewport();
    renderScreen(<HistoryScreen />, { today: TODAY });

    const row = (await screen.findAllByText(/^Morning run — 5 km · /))[0] as HTMLElement;
    fireEvent.click(row);

    const heading = await screen.findByRole('heading', { level: 2, name: /^Morning run — 5 km/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('should move focus to the detail when a history row is selected with the keyboard', async () => {
    stubNarrowViewport();
    const user = userEvent.setup();
    renderScreen(<HistoryScreen />, { today: TODAY });

    const rowText = (await screen.findAllByText(/^Morning run — 5 km · /))[0] as HTMLElement;
    const rowButton = rowText.closest('button') as HTMLButtonElement;
    rowButton.focus();
    await user.keyboard(' ');

    const heading = await screen.findByRole('heading', { level: 2, name: /^Morning run — 5 km/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('should not move focus to the detail for the auto-selected newest record before any selection', async () => {
    stubNarrowViewport();
    renderScreen(<HistoryScreen />, { today: TODAY });

    await screen.findByText(/^Today · /);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});

describe('Insights screen', () => {
  it('should render the period comparison against your own history only', async () => {
    renderScreen(<InsightsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeDefined();
    expect(await screen.findByText('The last 90 days, against the 90 before them.')).toBeDefined();
    expect(screen.getByText('These numbers are yours alone')).toBeDefined();
  });

  it('should switch the period', async () => {
    renderScreen(<InsightsScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('radio', { name: '30 days' }));
    expect(await screen.findByText('The last 30 days, against the 30 before them.')).toBeDefined();
  });
});

describe('Weekly review', () => {
  it('should walk the five steps and close the week at the end', async () => {
    renderScreen(<WeeklyReviewScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Weekly Review' })).toBeDefined();
    expect(await screen.findByText('What you kept')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/below your weekly average\.$/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Not enough water entries to say anything')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your reflection')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Finish the review' }));
    expect(await screen.findByText(/^Week \d+ closed$/)).toBeDefined();
  });
});

describe('Coach screen', () => {
  it('should ask for a consent decision before anything can be submitted', async () => {
    renderScreen(<AiScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Ask' })).toBeDefined();
    expect(await screen.findByText('Before the coach reads anything')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Submit request' })).toBeNull();
  });

  it('should show the remaining quota once the gate is passed', async () => {
    renderScreen(<AiScreen />, { today: TODAY });
    await passTheConsentGate();
    expect(await screen.findByText('1 of 2 requests left this month')).toBeDefined();
    expect(screen.getByText(/Free includes 2 requests a month/)).toBeDefined();
  });

  it('should queue a request and spend one of the quota', async () => {
    renderScreen(<AiScreen />, { today: TODAY });
    await passTheConsentGate();

    fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'Why do Thursdays keep failing?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText('Queued')).toBeDefined();
    expect(await screen.findByText('0 of 2 requests left this month')).toBeDefined();
  });

  it('should refuse the third request of the month and point at the plans', async () => {
    renderScreen(<AiScreen />, { today: TODAY });
    await passTheConsentGate();

    for (const question of ['One', 'Two']) {
      fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: question } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    }

    expect(await screen.findByText(/Both requests this month are used/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
