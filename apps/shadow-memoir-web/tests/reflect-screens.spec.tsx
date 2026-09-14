import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiScreen } from '@/features/ai';
import { HistoryScreen } from '@/features/history';
import { barHeightPx, InsightsScreen, PLOT_HEIGHT } from '@/features/insights';
import { WeeklyReviewScreen } from '@/features/review';
import { deriveInsights, reflectSeed, shiftDate } from '@/lib/data';
import { SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { createSyncedTestData, createTestEngine, sharedBacking } from './sync-harness';

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

  it('should not show a record detail for an empty account', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByText('Nothing logged yet')).toBeDefined();
    expect(screen.queryByText('Nothing recorded yet')).toBeNull();
    expect(screen.queryByText(/^Open in /)).toBeNull();
  });

  it('should not show a filtered-out notice for the unselected auto-picked record', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    await screen.findByText(/^Today · /);

    fireEvent.click(await screen.findByRole('button', { name: 'Expense' }));

    expect(screen.getByText('Select a record to see its details.')).toBeDefined();
    expect(screen.queryByText("This record doesn't match the current filter or search.")).toBeNull();
  });

  it('should show the true record total in pagination', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('button', { name: 'Quest' }));
    expect(await screen.findByText(/Showing 1 to 20 of 2,515/)).toBeDefined();
  });

  it('should recompute range totals for the active filter', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    await screen.findByText(/^Today · /);
    fireEvent.change(screen.getByLabelText('Search all records'), { target: { value: 'nothing at all' } });

    expect(await screen.findByText('Nothing matches that yet')).toBeDefined();
    expect(screen.getByText('0 quest records · 0 outcomes · 0 kept')).toBeDefined();
    expect(screen.getByText(/^0 expenses/)).toBeDefined();
  });

  it('should agree with the Quest chip on how many quest records matched', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('button', { name: 'Quest' }));

    expect(await screen.findByText('2515 matching records')).toBeDefined();
    expect(screen.getByText('2,515 quest records · 2,515 outcomes · 2,065 kept')).toBeDefined();
  });

  it('should show a loading state for history before the first sync', async () => {
    const { engine } = createTestEngine({ today: TODAY });
    const data = createSyncedTestData(engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <HistoryScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeDefined();
  });

  it('should keep focus in the search field while typing', async () => {
    const user = userEvent.setup();
    renderScreen(<HistoryScreen />, { today: TODAY });
    const input = await screen.findByLabelText('Search all records');

    await user.click(input);
    await user.type(input, 'run');

    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('run');
  });

  it('should focus the first row after a page change', async () => {
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('button', { name: 'Quest' }));
    await screen.findByText(/matching records$/);

    const pageTwo = screen.getByRole('button', { name: 'Page 2' });
    fireEvent.click(pageTwo);

    await waitFor(() => expect(document.activeElement?.getAttribute('aria-pressed')).not.toBeNull());
    expect(document.activeElement).not.toBe(pageTwo);
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

  it('should show an error instead of zero KPIs when sync fails', async () => {
    const test = createTestEngine({ today: TODAY, status: () => 500 });
    const data = createSyncedTestData(test.engine);

    renderScreen(
      <SyncEngineProvider data={data}>
        <InsightsScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.queryByText('Quests kept')).toBeNull();
  });

  // Asserts the height math the component writes as an inline style; the real box model is a Phase 4 visual check.
  it('should scale weekday adherence bars', async () => {
    renderScreen(<InsightsScreen />, { today: TODAY });
    await screen.findByRole('heading', { name: 'Insights' });

    const expectedBars = deriveInsights(reflectSeed(TODAY, 'active'), '90').adherenceByWeekday;
    const max = Math.max(...expectedBars.map(bar => bar.value), 1);
    expect(max).toBeGreaterThan(0);

    for (const bar of expectedBars) {
      const el = await screen.findByRole('img', { name: bar.ariaLabel });
      expect((el as HTMLElement).style.height).toBe(`${barHeightPx(bar.value, max)}px`);
    }

    const tallest = expectedBars.find(bar => bar.value === max);
    expect(barHeightPx(tallest?.value ?? 0, max)).toBe(PLOT_HEIGHT);
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

  it('should not claim completion before the review is finished', async () => {
    renderScreen(<WeeklyReviewScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Weekly Review' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect((await screen.findAllByText('Not finished yet')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('should keep review answers after reload', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, today: TODAY, accountId: 'usr_A' });
    const data = createSyncedTestData(first.engine);

    const view = renderScreen(
      <SyncEngineProvider data={data}>
        <WeeklyReviewScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    await screen.findByText('What you kept');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Your reflection');

    const field = (await screen.findAllByPlaceholderText('One sentence is enough'))[0] as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Persist me please' } });
    fireEvent.blur(field);
    await screen.findByText('Saved');

    fireEvent.click(screen.getByRole('button', { name: 'Finish the review' }));
    expect(await screen.findByText(/^Week \d+ closed$/)).toBeDefined();

    view.unmount();

    const reloaded = createTestEngine({ backing, today: TODAY, accountId: 'usr_A' });
    const reloadedData = createSyncedTestData(reloaded.engine);
    renderScreen(
      <SyncEngineProvider data={reloadedData}>
        <WeeklyReviewScreen />
      </SyncEngineProvider>,
      { value: reloadedData },
    );

    expect(await screen.findByText(/^Week \d+ closed$/)).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Finish the review' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const reloadedField = (await screen.findAllByPlaceholderText('One sentence is enough'))[0] as HTMLTextAreaElement;
    expect(reloadedField.value).toBe('Persist me please');
  });

  it('should start a fresh review for a new week', async () => {
    const backing = sharedBacking();
    const first = createTestEngine({ backing, today: TODAY, accountId: 'usr_A' });
    const data = createSyncedTestData(first.engine);
    const view = renderScreen(
      <SyncEngineProvider data={data}>
        <WeeklyReviewScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    await screen.findByText('What you kept');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish the review' }));
    expect(await screen.findByText(/^Week \d+ closed$/)).toBeDefined();

    view.unmount();

    const nextWeek = createTestEngine({ backing, today: shiftDate(TODAY, 7), accountId: 'usr_A' });
    const nextWeekData = createSyncedTestData(nextWeek.engine);
    renderScreen(
      <SyncEngineProvider data={nextWeekData}>
        <WeeklyReviewScreen />
      </SyncEngineProvider>,
      { value: nextWeekData },
    );

    await screen.findByText('What you kept');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect((await screen.findAllByText('Not finished yet')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Completed')).toBeNull();
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
