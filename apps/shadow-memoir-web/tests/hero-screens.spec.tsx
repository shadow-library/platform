import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@shadow-library/ui';

import { EquippedThemeAccent, HeroScreen, RecoveryScreen } from '@/features/hero';
import { type DeltaPage, SYNC_META_KEYS, type SyncedMemoirData, SyncEngineProvider } from '@/lib/sync';

import { renderScreen } from './harness';
import { httpFake } from './http-fake';
import { withTimeZone } from './setup';
import { createSyncedTestData, createTestEngine, rejected } from './sync-harness';

const TODAY = '2026-08-22';

const GRANTS_PAGE: DeltaPage = {
  cursor: '1',
  hasMore: false,
  tombstones: [],
  domains: {
    achievements_earned: [{ id: 'a1', achievementId: 'first_quest_completed', earnedAt: '2026-05-17T09:00:00.000Z' }],
    titles_earned: [{ id: 't1', titleId: 'anchor_holder', earnedAt: '2026-05-17T09:00:00.000Z' }],
  },
};

const PROGRESSION_ACCOUNT = {
  level: 8,
  totalXp: '1231',
  xpIntoLevel: 104,
  xpForNextLevel: 339,
  coins: 40,
  hpToday: 4,
  hpMax: 5,
  warmthState: 'warm',
  statBody: 30,
  statMind: 15,
  statWealth: 0,
  statDiscipline: 12,
  shieldsAvailable: 2,
  shieldCap: 3,
  timezone: 'UTC',
  persona: 'active',
  comeback: null,
  crown: { label: 'this week', cadence: 'weekly', periodStart: '2026-08-17', closesOn: '2026-08-23', dayIndex: 6, dayCount: 7, keptPercent: 86 },
};

function progressionPage(account: Record<string, unknown> = {}, domains: DeltaPage['domains'] = {}): DeltaPage {
  return { cursor: '1', hasMore: false, tombstones: [], domains: { account: [{ ...PROGRESSION_ACCOUNT, ...account }], ...domains } };
}

function stubAccountApi(): void {
  httpFake({
    'GET /api/v1/account': () => ({
      body: { intensityMode: 'standard', pendingIntensityMode: null, scheduleStartMin: 420, scheduleEndMin: 1380, timezone: 'UTC', defaultCurrency: 'EUR' },
    }),
  });
}

function renderSynced(node: ReactNode, pages: DeltaPage[]): ReturnType<typeof createTestEngine> & { data: SyncedMemoirData } {
  const test = createTestEngine({ today: TODAY, pages });
  const data = createSyncedTestData(test.engine);
  renderScreen(<SyncEngineProvider data={data}>{node}</SyncEngineProvider>, { value: data });
  return { ...test, data };
}

function renderSyncedHero(): ReturnType<typeof createTestEngine> {
  const test = createTestEngine({ today: TODAY, pages: [GRANTS_PAGE] });
  const data = createSyncedTestData(test.engine);
  renderScreen(
    <SyncEngineProvider data={data}>
      <HeroScreen />
    </SyncEngineProvider>,
    { value: data },
  );
  return test;
}

function stubNarrowViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 999px)' || query === '(max-width: 899px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('Hero screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should render the crest with its level, coins and HP', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Hero' })).toBeDefined();
    expect(await screen.findByLabelText('HP 4 of 5')).toBeDefined();
    expect(screen.getByText('◈ 312')).toBeDefined();
    expect(screen.getByText('Recent progression')).toBeDefined();
  });

  it('should render an earned achievement and title with a local formatted date, not the raw ISO timestamp', async () =>
    withTimeZone('Europe/Oslo', async () => {
      renderSyncedHero();
      fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Achievements' }));
      expect(await screen.findByText('Earned 17 May 2026')).toBeDefined();
      expect(screen.queryByText(/2026-05-17T/)).toBeNull();

      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Titles' }));
      expect(await screen.findByText(/earned 17 May 2026/)).toBeDefined();
      expect(screen.queryByText(/2026-05-17T/)).toBeNull();
    }));

  it('should show locked achievements as a teaser with no counter', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Achievements' }));

    const locked = await screen.findAllByText('Locked');
    expect(locked.length).toBeGreaterThan(0);

    fireEvent.click(locked[1] as HTMLElement);
    expect(await screen.findByText(/Locked achievements show no counter and no progress bar/)).toBeDefined();
    expect(screen.queryByText(/of 17/)).toBeNull();
  });

  it('should move focus to the achievement detail when a tile is selected on narrow layouts', async () => {
    stubNarrowViewport();
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Achievements' }));

    const locked = await screen.findAllByText('Locked');
    fireEvent.click(locked[1] as HTMLElement);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Locked' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('should reveal and focus the achievement detail when a tile is selected with the keyboard', async () => {
    stubNarrowViewport();
    const user = userEvent.setup();
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Achievements' }));

    const lockedName = (await screen.findAllByText('Locked'))[1] as HTMLElement;
    const lockedButton = lockedName.closest('button') as HTMLButtonElement;
    lockedButton.focus();
    await user.keyboard('{Enter}');

    const heading = await screen.findByRole('heading', { level: 2, name: 'Locked' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('should not move focus to the achievement detail on mount, before any selection', async () => {
    stubNarrowViewport();
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Achievements' }));

    await screen.findByRole('heading', { level: 2, name: /^(Locked|Earned)$/ });
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });

  it('should change the displayed title to another earned one', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Titles' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Display Anchor Holder' }));
    expect(await screen.findByRole('button', { name: 'Displayed' })).toBeDefined();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Anchor Holder')).toBeDefined();
  });

  it('should offer no title action on a hero who has earned none', async () => {
    renderScreen(<HeroScreen />, { today: TODAY, persona: 'new' });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Titles' }));
    expect(await screen.findByText('No titles yet')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Display / })).toBeNull();
  });

  it('should not call a hero with no earned titles "Unnamed hero"', async () => {
    renderScreen(<HeroScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByText('New hero')).toBeDefined();
    expect(screen.queryByText('Unnamed hero')).toBeNull();
  });

  it('should refuse a cosmetic the coin balance cannot reach, without blame', async () => {
    renderScreen(<HeroScreen />, { today: TODAY, persona: 'new' });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));

    expect(await screen.findByText('Cosmetics you can’t yet afford wait here until your balance reaches them.')).toBeDefined();
    const action = screen.getByRole('button', { name: '150 more coins' });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it('should equip a cosmetic the coin balance covers and spend the coins', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock for 100 ◈' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect((await screen.findAllByText('◈ 212')).length).toBeGreaterThan(0);
  });

  it('should show level progress from the account row', async () => {
    renderSynced(<HeroScreen />, [progressionPage()]);

    expect(await screen.findByText('104 / 339 XP')).toBeDefined();
    expect(screen.getByText(/235 to level 9/)).toBeDefined();
    expect(screen.getByText('2 of 3')).toBeDefined();
    expect(screen.getByText('Crown · this week')).toBeDefined();
    expect(screen.getByText('Day 6 of 7 · closes 23 Aug · 86% kept.')).toBeDefined();
    expect(screen.getByText('Warm')).toBeDefined();
    expect(screen.getByText('Body')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Coming back' })).toBeNull();
  });

  it('should list hero events', async () => {
    renderSynced(<HeroScreen />, [
      progressionPage(
        {},
        {
          quests: [{ id: '7', name: 'Morning run', durationMin: 30, recurrence: { frequency: 'daily' }, active: true }],
          hero_events: [
            { id: '3', type: 'level_up', levelAfter: 9, date: TODAY, createdAt: '2026-08-22T07:31:00.000Z', xpDelta: 0, coinsDelta: 0 },
            { id: '1', type: 'crown_init', date: TODAY, createdAt: '2026-08-22T00:01:00.000Z', xpDelta: 0, coinsDelta: 0 },
            { id: '2', type: 'quest_complete', questId: '7', statAffinity: 'body', statDelta: 1, date: TODAY, createdAt: '2026-08-22T07:30:00.000Z', xpDelta: 12, coinsDelta: 2 },
          ],
          daily_states: [
            { date: '2026-08-20', crownPeriodStart: '2026-08-20', crownBankedXp: 30, crownBankedCoins: 3 },
            { date: '2026-08-21', crownPeriodStart: '2026-08-21', crownBankedXp: 0, crownBankedCoins: 0 },
            { date: TODAY, crownPeriodStart: TODAY, crownBankedXp: null, crownBankedCoins: null },
          ],
        },
      ),
    ]);

    expect(await screen.findByText('Level 9 reached')).toBeDefined();
    const kept = screen.getByText('Morning run kept');
    expect(screen.getByText('Level 9 reached').compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('+12 XP · +2 ◈')).toBeDefined();
    expect(screen.getByText('Body +1')).toBeDefined();
    expect(screen.queryByText('Crown period opened')).toBeNull();
    expect(screen.queryByText(/Nothing has happened yet/)).toBeNull();
    expect(screen.getByLabelText('20 Aug: banked')).toBeDefined();
    expect(screen.getByLabelText('21 Aug: not banked')).toBeDefined();
  });

  it('should never price a cosmetic that comes from an achievement', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    expect(await screen.findByText('Comes with an achievement, never with coins.')).toBeDefined();
  });

  it('should confirm and send one cosmetic purchase', async () => {
    const { server } = renderSynced(<HeroScreen />, [progressionPage({ coins: 200 })]);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));

    const [unlock] = await screen.findAllByRole('button', { name: 'Unlock for 100 ◈' });
    fireEvent.click(unlock as HTMLElement);
    fireEvent.click(unlock as HTMLElement);
    expect(await screen.findByText(/You have 200\./)).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(server.batches.flatMap(batch => batch.types)).toEqual(['cosmetic.purchase']));
  });

  it('should not toast success when a purchase is rejected, and the tile reverts', async () => {
    const success = vi.spyOn(toast, 'success');
    const neutral = vi.spyOn(toast, 'neutral');
    const warning = vi.spyOn(toast, 'warning');
    const test = createTestEngine({
      today: TODAY,
      pages: [progressionPage({ coins: 200 })],
      outcomes: batch => batch.commandIds.map(id => rejected(id, 'Not enough coins for this purchase', 'CMD_002')),
    });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <HeroScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    const emberHeading = await screen.findByRole('heading', { name: 'Ember accent' });
    const emberTile = emberHeading.parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(emberTile).getByRole('button', { name: 'Unlock for 100 ◈' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(success).not.toHaveBeenCalled();
    expect(neutral).not.toHaveBeenCalled();
    await waitFor(() => expect(within(emberTile).getByRole('button', { name: 'Unlock for 100 ◈' })).toBeDefined());
  });

  it('should toast success and keep the Cosmetics tab selected after an applied purchase', async () => {
    const success = vi.spyOn(toast, 'success');
    renderSynced(<HeroScreen />, [progressionPage({ coins: 200 })]);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    const [unlock] = await screen.findAllByRole('button', { name: 'Unlock for 100 ◈' });
    fireEvent.click(unlock as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
    expect(String(success.mock.calls[0]?.[0])).toMatch(/unlocked and equipped/);
    expect(screen.getByRole('tab', { name: 'Cosmetics' }).getAttribute('aria-selected')).toBe('true');
  });

  it('should show an error instead of a level-1 hero when sync fails', async () => {
    const test = createTestEngine({ today: TODAY, status: () => 500 });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <HeroScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    expect(await screen.findByText("Couldn't load this right now")).toBeDefined();
    expect(screen.queryByText('Choose a name')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull();
  });

  it('should navigate hero tabs with arrow keys', async () => {
    const user = userEvent.setup();
    renderScreen(<HeroScreen />, { today: TODAY });

    const overview = await screen.findByRole('tab', { name: 'Overview' });
    overview.focus();
    await user.keyboard('{ArrowRight}');

    const achievements = screen.getByRole('tab', { name: 'Achievements' });
    expect(document.activeElement).toBe(achievements);
    expect(achievements.getAttribute('aria-selected')).toBe('true');
    expect((await screen.findAllByText('Locked')).length).toBeGreaterThan(0);
  });

  it('should own the starter cosmetic on a new account', async () => {
    const test = createTestEngine({ today: TODAY, pages: [progressionPage({ coins: 0 })] });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <HeroScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    expect((await screen.findAllByRole('button', { name: 'Equipped' })).length).toBe(1);
    expect(screen.getByText('Bronze badge')).toBeDefined();
  });

  it('should stop offering an action on the starter crest once another badge is equipped', async () => {
    renderSynced(<HeroScreen />, [progressionPage({ coins: 200 })]);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock for 150 ◈' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText('Starter crest')).toBeDefined();
    expect((await screen.findAllByRole('button', { name: 'Equipped' })).length).toBe(1);
  });

  it('should apply an equipped theme accent to the document', async () => {
    const { unmount } = renderScreen(
      <>
        <EquippedThemeAccent />
        <HeroScreen />
      </>,
      { today: TODAY },
    );

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    const [unlock] = await screen.findAllByRole('button', { name: 'Unlock for 75 ◈' });
    fireEvent.click(unlock as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(document.documentElement.getAttribute('data-accent')).toBe('sunrise'));
    unmount();
  });

  it('should remove the accent attribute on unmount and not carry it into an account with none equipped', async () => {
    const first = renderScreen(
      <>
        <EquippedThemeAccent />
        <HeroScreen />
      </>,
      { today: TODAY },
    );

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    const [unlock] = await screen.findAllByRole('button', { name: 'Unlock for 75 ◈' });
    fireEvent.click(unlock as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-accent')).toBe('sunrise'));

    first.unmount();
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);

    renderScreen(
      <>
        <EquippedThemeAccent />
        <HeroScreen />
      </>,
      { today: TODAY, persona: 'new' },
    );
    await screen.findByRole('heading', { name: 'Hero' });
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });

  it('should scope an equipped hero-card accent to the crest, not the document', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Cosmetics' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock for 100 ◈' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(document.querySelector('[data-hero-accent]')).not.toBeNull());
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });

  it('should show a compact bar instead of one pip per point for a large HP maximum', async () => {
    renderSynced(<HeroScreen />, [progressionPage({ hpToday: 40, hpMax: 45 })]);
    expect(await screen.findByRole('progressbar', { name: 'HP 40 of 45' })).toBeDefined();
    expect(screen.getByText('HP 40 of 45')).toBeDefined();
  });

  it('should show "No HP yet" instead of a false "full" note when there is no HP pool', async () => {
    renderSynced(<HeroScreen />, [progressionPage({ hpToday: 0, hpMax: 0 })]);
    expect(await screen.findByText('No HP yet')).toBeDefined();
    expect(screen.queryByText('full')).toBeNull();
  });

  it('should clear the displayed title', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Titles' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Clear displayed title' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear displayed title' })).toBeNull());

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Choose a name')).toBeDefined();
  });

  it('should revert the displayed title and warn once when the server rejects it', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const test = createTestEngine({
      today: TODAY,
      pages: [GRANTS_PAGE],
      outcomes: batch => batch.commandIds.map(id => rejected(id, 'That title has not been earned yet.', 'CMD_002')),
    });
    const data = createSyncedTestData(test.engine);
    renderScreen(
      <SyncEngineProvider data={data}>
        <HeroScreen />
      </SyncEngineProvider>,
      { value: data },
    );

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Titles' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Display Anchor Holder' }));
    await screen.findByRole('button', { name: 'Displayed' });

    await waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Display Anchor Holder' })).toBeDefined());
  });

  it('should send exactly one title.display command with titleId null when clearing, and toast', async () => {
    const success = vi.spyOn(toast, 'success');
    const { server } = renderSynced(<HeroScreen />, [
      progressionPage({ displayedTitleId: 'anchor_holder' }, { titles_earned: [{ id: 't1', titleId: 'anchor_holder', earnedAt: '2026-05-17T09:00:00.000Z' }] }),
    ]);

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Titles' }));
    await screen.findByRole('button', { name: 'Displayed' });
    const before = server.batches.length;

    fireEvent.click(await screen.findByRole('button', { name: 'Clear displayed title' }));

    await waitFor(() => expect(server.batches.length).toBe(before + 1));
    expect(server.batches[before]?.types).toEqual(['title.display']);
    await waitFor(() => expect(success).toHaveBeenCalledWith('No title displayed.', undefined));
  });
});

describe('Recovery screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should state what was lost and what was not', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });
    expect(await screen.findByRole('heading', { name: 'Coming back' })).toBeDefined();
    expect(await screen.findByText(/No XP was removed, no level was lost/)).toBeDefined();
    expect(screen.getByText('Open choices')).toBeDefined();
  });

  it('should not show the fixture narrative', async () => {
    stubAccountApi();
    renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'returner', hpToday: 1 })]);

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeDefined();
    expect(screen.getByText('Open choices')).toBeDefined();
    expect(screen.queryByText(/eight days/)).toBeNull();
    expect(screen.queryByText('Next week reads heavy')).toBeNull();
    expect(screen.queryByText('Add a morning walk')).toBeNull();
    expect(screen.queryByText(/Thursday/)).toBeNull();
  });

  it('should mark a shielded miss as shielded on coming back', async () => {
    stubAccountApi();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    try {
      renderSynced(<RecoveryScreen />, [
        progressionPage(
          { persona: 'recovery' },
          {
            quests: [
              { id: '7', name: 'Morning run', durationMin: 30, recurrence: { frequency: 'daily' }, active: true },
              { id: '8', name: 'Evening stretch', durationMin: 10, recurrence: { frequency: 'daily' }, active: true },
              { id: '9', name: 'Read 20 pages', durationMin: 20, recurrence: { frequency: 'daily' }, active: true },
            ],
            quest_logs: [
              { id: 'l1', questId: '7', date: '2026-08-21', state: 'missed', shielded: true },
              { id: 'l2', questId: '8', date: '2026-08-20', state: 'missed', shielded: false },
              { id: 'l3', questId: '9', date: '2026-08-19', state: 'missed', shielded: true },
              { id: 'l4', questId: '9', date: '2026-08-20', state: 'missed', shielded: false },
            ],
            quest_streaks: [
              { questId: '7', currentRunDays: 0 },
              { questId: '8', currentRunDays: 12 },
            ],
          },
        ),
      ]);

      const shielded = (await screen.findByText('Morning run')).closest('li') as HTMLElement;
      expect(within(shielded).getByText('Shielded')).toBeDefined();
      const missed = screen.getByText('Evening stretch').closest('li') as HTMLElement;
      expect(within(missed).getByText('Missed')).toBeDefined();
      const mixed = screen.getByText('Read 20 pages').closest('li') as HTMLElement;
      expect(within(mixed).getByText('Missed')).toBeDefined();
      expect(within(mixed).getByText(/1 shielded/)).toBeDefined();
      expect(screen.queryByText(/Streak kept|Streak closed/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should dismiss coming back for the day', async () => {
    stubAccountApi();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    try {
      const { data, store } = renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'recovery', comeback: { armed: true, firedOn: null } })]);

      fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

      const note = await screen.findByRole('heading', { name: 'Not now' });
      await waitFor(() => expect(document.activeElement).toBe(note));
      expect(screen.queryByText('Open choices')).toBeNull();
      expect(await store.readMeta(SYNC_META_KEYS.comingBackDismissedOn)).toBe('2026-08-22');
      expect(await data.hero.getComingBack()).toEqual({ kind: 'dismissed', reason: 'recovery' });

      vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
      expect(await data.hero.getComingBack()).toEqual({ kind: 'offered', reason: 'recovery' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should let intensity be lowered without touching earned experience', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });
    const gentle = await screen.findByRole('button', { name: /Gentle/ });
    expect(gentle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Demanding/ }));
    expect((await screen.findByRole('button', { name: /Demanding/ })).getAttribute('aria-pressed')).toBe('true');
  });

  it('should disable every intensity option while one is saving, without losing focus', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });
    const demanding = await screen.findByRole('button', { name: /Demanding/ });
    const gentle = screen.getByRole('button', { name: /Gentle/ });

    demanding.focus();
    fireEvent.click(demanding);
    expect(demanding.getAttribute('aria-disabled')).toBe('true');
    expect(gentle.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(demanding);

    await waitFor(() => expect(gentle.getAttribute('aria-disabled')).toBeNull());
  });

  it('should not send a PATCH when the active option is clicked again', async () => {
    const fake = httpFake({
      'GET /api/v1/account': () => ({
        body: { intensityMode: 'low_intensity', pendingIntensityMode: null, scheduleStartMin: 420, scheduleEndMin: 1380, timezone: 'UTC', defaultCurrency: 'EUR' },
      }),
    });
    renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'recovery' })]);

    const gentle = await screen.findByRole('button', { name: /Gentle/ });
    expect(gentle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(gentle);
    expect(gentle.getAttribute('aria-disabled')).toBeNull();
    expect(fake.count('PATCH', '/api/v1/account')).toBe(0);
  });

  it('should show the staged intensity as "From tomorrow" after a synced save', async () => {
    const success = vi.spyOn(toast, 'success');
    const account: Record<string, unknown> = {
      intensityMode: 'standard',
      pendingIntensityMode: null,
      scheduleStartMin: 420,
      scheduleEndMin: 1380,
      timezone: 'UTC',
      defaultCurrency: 'EUR',
    };
    httpFake({
      'GET /api/v1/account': () => ({ body: account }),
      'PATCH /api/v1/account': call => {
        const body = call.body as { intensityMode?: string } | null;
        if (body?.intensityMode) account['pendingIntensityMode'] = body.intensityMode;
        return { body: account };
      },
    });
    renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'recovery' })]);

    const demanding = await screen.findByRole('button', { name: /Demanding/ });
    fireEvent.click(demanding);
    expect(demanding.getAttribute('aria-disabled')).toBe('true');

    await waitFor(() => expect(success).toHaveBeenCalledWith('Staged. It takes effect at your next daily rollover, so the day in progress is not rewritten.', undefined));
    await waitFor(() => expect(demanding.getAttribute('aria-disabled')).toBeNull());

    const standard = screen.getByRole('button', { name: /Standard/ });
    expect(standard.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(within(demanding).getByText('From tomorrow')).toBeDefined());
  });

  it('should not label the active intensity as staged when the server echoes the same mode', async () => {
    httpFake({
      'GET /api/v1/account': () => ({
        body: { intensityMode: 'standard', pendingIntensityMode: 'standard', scheduleStartMin: 420, scheduleEndMin: 1380, timezone: 'UTC', defaultCurrency: 'EUR' },
      }),
    });
    renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'recovery' })]);

    const standard = await screen.findByRole('button', { name: /Standard/ });
    expect(standard.getAttribute('aria-pressed')).toBe('true');
    expect(within(standard).queryByText('From tomorrow')).toBeNull();
  });

  it('should label a staged intensity as effective tomorrow, not already selected', async () => {
    httpFake({
      'GET /api/v1/account': () => ({
        body: { intensityMode: 'standard', pendingIntensityMode: 'high_intensity', scheduleStartMin: 420, scheduleEndMin: 1380, timezone: 'UTC', defaultCurrency: 'EUR' },
      }),
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-22T10:00:00.000Z'));
    try {
      renderSynced(<RecoveryScreen />, [progressionPage({ persona: 'recovery' })]);

      const standard = await screen.findByRole('button', { name: /Standard/ });
      expect(standard.getAttribute('aria-pressed')).toBe('true');

      const demanding = screen.getByRole('button', { name: /Demanding/ });
      expect(demanding.getAttribute('aria-pressed')).toBe('false');
      expect(within(demanding).getByText('From tomorrow')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should render context asides before the main column on narrow layouts', async () => {
    stubNarrowViewport();
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });

    const warning = await screen.findByText('Next week reads heavy');
    const openChoices = screen.getByText('Open choices');
    expect(warning.compareDocumentPosition(openChoices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should keep the aside after the main column at desktop width', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });

    const openChoices = await screen.findByText('Open choices');
    const warning = screen.getByText('Next week reads heavy');
    expect(openChoices.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
