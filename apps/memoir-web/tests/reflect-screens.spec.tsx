import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from '@shadow-library/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiScreen } from '@/features/ai';
import { HistoryScreen } from '@/features/history';
import { barHeightPx, InsightsScreen, PLOT_HEIGHT, validateInsightsSearch } from '@/features/insights';
import { WeeklyReviewScreen } from '@/features/review';
import { NetStrip, SystemOverlayProvider } from '@/features/shell';
import { COACH_POLL_INTERVAL_MS, COACH_QUEUED_POLL_INTERVAL_MS, coachPollDelay, deriveInsights, reflectSeed, shiftDate } from '@/lib/data';
import { type DeltaPage, SyncEngineProvider } from '@/lib/sync';
import { getRouter } from '@/router';
import { Route as AskRoute } from '@/routes/_account/_app/ai';

import { renderScreen } from './harness';
import { httpFake } from './http-fake';
import { createSyncedTestData, createTestEngine, deltaResponse, type FakeServer, sharedBacking, type TestEngineOptions } from './sync-harness';

const TODAY = '2026-08-22';

async function passTheConsentGate(): Promise<void> {
  fireEvent.click(await screen.findByRole('switch', { name: /Journal reflections and reasons/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
}

function readCss(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8');
}

function stubResizeObservers(): () => void {
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
  return () => callbacks.forEach(callback => callback());
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

    expect(await screen.findByText('2,515 matching records')).toBeDefined();
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

  it('should scroll the first day heading of the new page into view rather than its first row', async () => {
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this);
    });
    renderScreen(<HistoryScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('button', { name: 'Quest' }));
    await screen.findByText(/matching records$/);

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    await waitFor(() => expect(document.activeElement?.getAttribute('aria-pressed')).not.toBeNull());
    const heading = scrolled.at(-1) as HTMLElement;
    expect(heading.tagName).toBe('H2');
    expect(heading.nextElementSibling?.querySelector('button')).toBe(document.activeElement);
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
  afterEach(() => vi.unstubAllGlobals());

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

  it('should keep the viewed period in the address and hand it to Ask', async () => {
    const { router } = renderScreen(<InsightsScreen />, { today: TODAY, initialPath: '/insights' });
    fireEvent.click(await screen.findByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ period: '30' }));

    fireEvent.click(screen.getByRole('link', { name: 'Ask the coach about this' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ai'));
    expect(router.state.location.search).toEqual({ ask: 'Looking at my last 30 days against the 30 before them, what stands out, and what would be worth changing?' });
  });

  it('should read the insights period from the address whether it was written as a number or a string', () => {
    expect(validateInsightsSearch({ period: 30 })).toEqual({ period: '30' });
    expect(validateInsightsSearch({ period: '365' })).toEqual({ period: '365' });
    expect(validateInsightsSearch({ period: '7' })).toEqual({ period: undefined });
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

  it('should title the longest streak caption only while its clamp hides part of it', async () => {
    const resizes = stubResizeObservers();
    renderScreen(<InsightsScreen />, { today: TODAY });
    const caption = await screen.findByText(/^Held by /);
    const box = { scrollHeight: 66, clientHeight: 66 };
    Object.defineProperty(caption, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
    Object.defineProperty(caption, 'clientHeight', { configurable: true, get: () => box.clientHeight });

    expect(caption.hasAttribute('title')).toBe(false);

    box.scrollHeight = 110;
    act(resizes);
    expect(caption.getAttribute('title')).toBe(caption.textContent);

    box.scrollHeight = 66;
    act(resizes);
    expect(caption.hasAttribute('title')).toBe(false);
    expect(readCss('../src/features/insights/insights.module.css')).toMatch(/\.kpiCaption\s*{[^}]*overflow-wrap:\s*anywhere;[^}]*-webkit-line-clamp:\s*3;/);
  });

  it('should put every month bar on one baseline regardless of its label height', async () => {
    renderScreen(<InsightsScreen />, { today: TODAY });
    const chart = await screen.findByRole('group', { name: 'Experience earned, by month' });
    const columns = [...chart.children];

    expect(columns.length).toBeGreaterThan(1);
    for (const column of columns) {
      const [plot, label] = [...column.children];
      expect(plot?.querySelector('[role="img"]')).not.toBeNull();
      expect(label?.querySelector('[role="img"]')).toBeNull();
    }

    const css = readCss('../src/features/insights/insights.module.css');
    expect(css).toMatch(/\.columns\s*{[^}]*align-items:\s*(flex-)?start;/);
    expect(css).not.toMatch(/\.columns\s*{[^}]*align-items:\s*(flex-)?end;/);
    expect(css).toMatch(new RegExp(`\\.plot\\s*{[^}]*height:\\s*${PLOT_HEIGHT}px;`));
  });
});

describe('Ask route search', () => {
  const validateAskSearch = AskRoute.options.validateSearch as (search: Record<string, unknown>) => { ask?: string };

  it('should carry a prefill with special characters through the address unchanged', () => {
    const router = getRouter();
    const ask = 'Why do “Thursdays” & 50% of #mornings slip?\nLine two — 🙂';
    const { href } = router.buildLocation({ to: '/ai', search: { ask } });

    expect(validateAskSearch(router.options.parseSearch(new URL(href, 'http://localhost').search))).toEqual({ ask });
  });

  it('should drop a prefill the server could not accept', () => {
    expect(validateAskSearch({ ask: 'x'.repeat(2001) })).toEqual({ ask: undefined });
    expect(validateAskSearch({ ask: 'x'.repeat(2000) })).toEqual({ ask: 'x'.repeat(2000) });
    expect(validateAskSearch({ ask: '   ' })).toEqual({ ask: undefined });
    expect(validateAskSearch({ ask: 90 })).toEqual({ ask: undefined });
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

  it('should prefill Ask from an insight link', async () => {
    const insights = renderScreen(<InsightsScreen />, { today: TODAY, initialPath: '/insights' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Year' }));
    await waitFor(() => expect(insights.router.state.location.search).toEqual({ period: '365' }));
    const href = screen.getByRole('link', { name: 'Ask the coach about this' }).getAttribute('href') ?? '';
    insights.unmount();

    const { router } = renderScreen(<AiScreen />, { today: TODAY, initialPath: href });
    await passTheConsentGate();

    const composer = (await screen.findByLabelText('Your question')) as HTMLTextAreaElement;
    expect(composer.value).toBe('Looking at my last year, what stands out, and what would be worth changing?');

    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Queued')).toBeDefined();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
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

  describe('when synced', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function renderSyncedAsk(options: TestEngineOptions = {}): ReturnType<typeof createTestEngine> {
      const test = createTestEngine({ today: TODAY, ...options });
      const data = createSyncedTestData(test.engine);
      renderScreen(
        <SyncEngineProvider data={data}>
          <AiScreen />
        </SyncEngineProvider>,
        { value: data },
      );
      return test;
    }

    it('should not show the consent gate before the first sync', async () => {
      let open = (): void => undefined;
      const opened = new Promise<void>(resolve => (open = resolve));
      const { engine } = renderSyncedAsk({
        fetchImpl: server => async (input, init) => {
          if (String(input).includes('/sync/delta')) await opened;
          return server.fetchImpl(input, init);
        },
      });

      await waitFor(() => expect(engine.getSnapshot().state).toBe('syncing'));
      expect(screen.getByRole('status', { name: 'Loading' })).toBeDefined();
      expect(screen.queryByText('Before the coach reads anything')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Save and continue' })).toBeNull();

      open();
      expect(await screen.findByText('Before the coach reads anything')).toBeDefined();
    });

    it('should show a failure rather than the consent gate when the first sync fails', async () => {
      renderSyncedAsk({ status: () => 500 });

      expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
      expect(screen.queryByText('Before the coach reads anything')).toBeNull();
      expect(screen.queryByText(/requests used on Free/)).toBeNull();
    });

    it('should send one consent update on double click', async () => {
      let release = (): void => undefined;
      const held = new Promise<void>(resolve => (release = resolve));
      const undecided = [
        { dataClass: 'journal_reflection_reason', granted: false, grantedAt: null, withdrawnAt: null },
        { dataClass: 'health', granted: false, grantedAt: null, withdrawnAt: null },
      ];
      const fake = httpFake({
        'PUT /api/v1/ai/consents': async () => {
          await held;
          return { body: { consents: undecided } };
        },
      });
      renderSyncedAsk();

      fireEvent.click(await screen.findByRole('switch', { name: /Journal reflections and reasons/ }));
      const save = screen.getByRole('button', { name: 'Save and continue' });
      fireEvent.click(save);
      fireEvent.click(save);
      await waitFor(() => expect(fake.count('PUT', '/api/v1/ai/consents')).toBe(1));
      await waitFor(() => expect(screen.getByRole('button', { name: /Saving/ }).getAttribute('aria-busy')).toBe('true'));
      fireEvent.click(screen.getByRole('button', { name: /Saving/ }));

      release();
      await waitFor(() => expect(screen.queryByRole('button', { name: /Saving/ })).toBeNull());
      expect(fake.count('PUT', '/api/v1/ai/consents')).toBe(1);
    });

    function consentServer(): { stored: Map<string, Record<string, unknown>>; fetchImpl: (server: FakeServer) => typeof fetch } {
      const stored = new Map<string, Record<string, unknown>>();
      httpFake({
        'PUT /api/v1/ai/consents': call => {
          const body = call.body as { grants: { dataClass: string; granted: boolean }[]; onlyIfUndecided?: boolean };
          if (body.onlyIfUndecided && stored.size > 0)
            return { status: 409, body: { code: 'AI_011', type: 'Conflict', message: 'AI consent has already been decided for this account' } };
          const now = new Date().toISOString();
          for (const grant of body.grants) stored.set(grant.dataClass, { dataClass: grant.dataClass, grantedAt: now, withdrawnAt: grant.granted ? null : now });
          return { body: { consents: [] } };
        },
      });
      const fetchImpl =
        (server: FakeServer): typeof fetch =>
        async (input, init) => {
          if (!String(input).includes('/sync/delta')) return server.fetchImpl(input, init);
          const page: DeltaPage = { cursor: '1', hasMore: false, domains: { ai_consents: [...stored.values()] }, tombstones: [] };
          return deltaResponse(input, page, server.epoch);
        };
      return { stored, fetchImpl };
    }

    it('should resolve the consent gate after declining both classes', async () => {
      const success = vi.spyOn(toast, 'success');
      const { stored, fetchImpl } = consentServer();
      renderSyncedAsk({ fetchImpl });

      fireEvent.click(await screen.findByRole('button', { name: 'Save and continue' }));

      expect(await screen.findByRole('button', { name: 'Submit request' })).toBeDefined();
      expect(screen.queryByText('Before the coach reads anything')).toBeNull();
      expect([...stored.values()].map(row => row['withdrawnAt'] !== null)).toEqual([true, true]);
      await waitFor(() => expect(success).toHaveBeenCalledWith(expect.stringContaining('Saved.'), undefined));
    });

    it('should explain and show the stored decision when another device decided first', async () => {
      const warning = vi.spyOn(toast, 'warning');
      const { stored, fetchImpl } = consentServer();
      renderSyncedAsk({ fetchImpl });

      fireEvent.click(await screen.findByRole('switch', { name: /Journal reflections and reasons/ }));
      stored.set('health', { dataClass: 'health', grantedAt: '2026-08-22T08:00:00.000Z', withdrawnAt: null });
      stored.set('journal_reflection_reason', { dataClass: 'journal_reflection_reason', grantedAt: '2026-08-22T08:00:00.000Z', withdrawnAt: '2026-08-22T08:00:00.000Z' });
      fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

      expect(await screen.findByRole('button', { name: 'Submit request' })).toBeDefined();
      expect(screen.queryByText('Before the coach reads anything')).toBeNull();
      await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining('already made on another device'), undefined));
      expect(stored.get('journal_reflection_reason')?.['withdrawnAt']).not.toBeNull();
    });

    const CONSENTS = [{ dataClass: 'journal_reflection_reason', grantedAt: '2026-08-01T00:00:00.000Z', withdrawnAt: null }];
    const WAITING_TASK = {
      id: 'task-1',
      queryText: 'Why do Thursdays keep failing?',
      status: 'running',
      kind: 'adhoc',
      submittedAt: '2026-08-22T09:00:00.000Z',
      expectedBy: '2026-08-22T22:00:00.000Z',
      quotaMonth: '2026-08',
      quotaConsumed: true,
      error: null,
    };
    const ANSWER = {
      id: '77',
      taskId: 'task-1',
      answer: 'Thursday carries five occurrences.',
      patterns: [],
      suggestions: [],
      limitationNote: null,
      createdAt: '2026-08-22T21:00:00.000Z',
    };
    const deltaPage = (domains: DeltaPage['domains']): DeltaPage => ({ cursor: '1', hasMore: false, domains, tombstones: [] });
    const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 30));

    it('should refresh a running request until it is done, and stop once it is', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      try {
        const { server } = renderSyncedAsk({
          pages: [
            deltaPage({ ai_consents: CONSENTS, ai_tasks: [WAITING_TASK] }),
            deltaPage({ ai_consents: CONSENTS, ai_tasks: [{ ...WAITING_TASK, status: 'done' }], ai_results: [ANSWER] }),
          ],
        });

        expect(await screen.findByText(/Reading your history now/)).toBeDefined();
        const pulls = server.deltaRequests.length;
        await vi.advanceTimersByTimeAsync(COACH_POLL_INTERVAL_MS);

        expect(await screen.findByText('Thursday carries five occurrences.')).toBeDefined();
        expect(screen.queryByText(/Reading your history now/)).toBeNull();
        expect(server.deltaRequests.length).toBeGreaterThan(pulls);

        const done = server.deltaRequests.length;
        await vi.advanceTimersByTimeAsync(COACH_POLL_INTERVAL_MS * 3);
        await settle();
        expect(server.deltaRequests.length).toBe(done);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should check a newly queued request once soon after it is asked', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      try {
        const queued = { ...WAITING_TASK, status: 'pending', expectedBy: new Date(Date.now() + 60 * 60_000).toISOString() };
        const { server } = renderSyncedAsk({ pages: [deltaPage({ ai_consents: CONSENTS, ai_tasks: [queued] })] });

        expect(await screen.findByRole('button', { name: 'Cancel the request' })).toBeDefined();
        const pulls = server.deltaRequests.length;
        await vi.advanceTimersByTimeAsync(COACH_POLL_INTERVAL_MS);
        await vi.waitFor(() => expect(server.deltaRequests.length).toBe(pulls + 1));
      } finally {
        vi.useRealTimers();
      }
    });

    it('should check a queued request slowly after the early check until the time it is expected by', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      try {
        const queued = { ...WAITING_TASK, status: 'pending', expectedBy: new Date(Date.now() + 60 * 60_000).toISOString() };
        const { server } = renderSyncedAsk({ pages: [deltaPage({ ai_consents: CONSENTS, ai_tasks: [queued] })] });

        expect(await screen.findByRole('button', { name: 'Cancel the request' })).toBeDefined();
        const beforeEarly = server.deltaRequests.length;
        await vi.advanceTimersByTimeAsync(COACH_POLL_INTERVAL_MS);
        await vi.waitFor(() => expect(server.deltaRequests.length).toBeGreaterThan(beforeEarly));
        await settle();
        const pulls = server.deltaRequests.length;

        await vi.advanceTimersByTimeAsync(COACH_POLL_INTERVAL_MS * 2);
        await settle();
        expect(server.deltaRequests.length).toBe(pulls);

        await vi.advanceTimersByTimeAsync(COACH_QUEUED_POLL_INTERVAL_MS);
        await vi.waitFor(() => expect(server.deltaRequests.length).toBeGreaterThan(pulls));
      } finally {
        vi.useRealTimers();
      }
    });

    it('should refresh a waiting request when the tab becomes visible again', async () => {
      const queued = { ...WAITING_TASK, status: 'pending', expectedBy: new Date(Date.now() + 60 * 60_000).toISOString() };
      renderSyncedAsk({
        pages: [deltaPage({ ai_consents: CONSENTS, ai_tasks: [queued] }), deltaPage({ ai_consents: CONSENTS, ai_tasks: [{ ...queued, status: 'done' }], ai_results: [ANSWER] })],
      });

      expect(await screen.findByRole('button', { name: 'Cancel the request' })).toBeDefined();
      fireEvent(document, new Event('visibilitychange'));

      expect(await screen.findByText('Thursday carries five occurrences.')).toBeDefined();
    });

    it('should tell the owner a cancelled task had already finished when the resync replaces its card', async () => {
      const warning = vi.spyOn(toast, 'warning');
      const queued = { ...WAITING_TASK, status: 'pending', expectedBy: new Date(Date.now() + 60 * 60_000).toISOString() };
      let domains: DeltaPage['domains'] = { ai_consents: CONSENTS, ai_tasks: [queued] };
      const fake = httpFake({
        'POST /api/v1/ai/tasks/task-1/cancel': () => {
          domains = { ai_consents: CONSENTS, ai_tasks: [{ ...queued, status: 'done' }], ai_results: [ANSWER] };
          return { status: 409, body: { code: 'AI_004', type: 'Conflict', message: 'This task is no longer pending and cannot be cancelled' } };
        },
      });
      renderSyncedAsk({
        fetchImpl: server => async (input, init) =>
          String(input).includes('/sync/delta') ? deltaResponse(input, deltaPage(domains), server.epoch) : server.fetchImpl(input, init),
      });

      const cancel = await screen.findByRole('button', { name: 'Cancel the request' });
      fireEvent.click(cancel);
      fireEvent.click(cancel);

      expect(await screen.findByText('Thursday carries five occurrences.')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
      await waitFor(() => expect(warning).toHaveBeenCalledWith(expect.stringContaining('It had already finished. The answer is below.'), undefined));
      expect(warning).toHaveBeenCalledTimes(1);
      expect(fake.count('POST', '/api/v1/ai/tasks/task-1/cancel')).toBe(1);
    });

    it('should not show the syncing strip for a background coach refresh', async () => {
      const { engine } = createTestEngine({ today: TODAY, pages: [deltaPage({ ai_consents: CONSENTS, ai_tasks: [WAITING_TASK] })] });
      const data = createSyncedTestData(engine);
      renderScreen(
        <SyncEngineProvider data={data}>
          <SystemOverlayProvider>
            <NetStrip />
          </SystemOverlayProvider>
        </SyncEngineProvider>,
        { value: data },
      );
      await waitFor(() => expect(engine.getSnapshot()).toMatchObject({ state: 'online', readiness: { kind: 'ready' } }));

      const states: string[] = [];
      const unsubscribe = engine.subscribe(() => states.push(engine.getSnapshot().state));
      expect(await data.reflect.refreshCoach()).toBe('refreshed');
      unsubscribe();

      expect(states).not.toContain('syncing');
      expect(screen.queryByText(/Syncing/)).toBeNull();
    });

    it('should not refresh anything while the account is being deleted', async () => {
      const { engine, server } = renderSyncedAsk({ status: () => 403, errorCode: 'ACC_002' });
      await screen.findByText('This account is being deleted');
      const pulls = server.deltaRequests.length;

      expect(await createSyncedTestData(engine).reflect.refreshCoach()).toBe('skipped');
      expect(server.deltaRequests.length).toBe(pulls);
    });

    it('should disable the composer while deletion is pending', async () => {
      renderSyncedAsk({ status: () => 403, errorCode: 'ACC_002' });

      expect(await screen.findByText('This account is being deleted')).toBeDefined();
      expect((screen.getByLabelText('Your question') as HTMLTextAreaElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByText('Before the coach reads anything')).toBeNull();
      expect(screen.queryByText(/requests used on Free/)).toBeNull();
    });
  });

  it('should open an older result from the history', async () => {
    renderScreen(<AiScreen />, { today: TODAY });
    await passTheConsentGate();

    fireEvent.click(await screen.findByRole('button', { name: 'Nightly summary · quests, planning, money' }));
    expect(screen.getByRole('button', { name: 'Nightly summary · quests, planning, money' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByRole('button', { name: 'Open the quest' }).length).toBeGreaterThan(0);
  });

  describe('coachPollDelay', () => {
    const NOW = Date.parse('2026-08-22T12:00:00.000Z');

    it('should poll a running request every 20 seconds', () => {
      expect(coachPollDelay({ state: 'processing', expectedBy: '' }, NOW, 0)).toBe(20_000);
    });

    it('should check a newly queued request once soon after it is asked', () => {
      expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T22:00:00.000Z' }, NOW, 0, false)).toBe(20_000);
    });

    it('should poll a queued request every 5 minutes until it is expected, then every 20 seconds', () => {
      expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T22:00:00.000Z' }, NOW, 0)).toBe(5 * 60_000);
      expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T12:02:00.000Z' }, NOW, 0)).toBe(2 * 60_000);
      expect(coachPollDelay({ state: 'queued', expectedBy: '2026-08-22T11:00:00.000Z' }, NOW, 0)).toBe(20_000);
    });

    it('should back off after failed refreshes up to 5 minutes', () => {
      const running = { state: 'processing' as const, expectedBy: '' };
      expect([1, 2, 3, 4, 10].map(failures => coachPollDelay(running, NOW, failures))).toEqual([40_000, 80_000, 160_000, 300_000, 300_000]);
    });

    it('should not poll a request that is not waiting', () => {
      expect(coachPollDelay({ state: 'held', expectedBy: '' }, NOW, 0)).toBeNull();
      expect(coachPollDelay({ state: 'failed', expectedBy: '' }, NOW, 0)).toBeNull();
    });
  });
});
