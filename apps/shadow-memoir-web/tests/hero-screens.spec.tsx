import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeroScreen, RecoveryScreen } from '@/features/hero';

import { renderScreen } from './harness';

const TODAY = '2026-08-22';

function stubNarrowViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 999px)' || query === '(max-width: 899px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('Hero screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should render the crest with its level, coins and HP', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Hero' })).toBeDefined();
    expect(await screen.findByLabelText('HP 4 of 5')).toBeDefined();
    expect(screen.getByText('◈ 312')).toBeDefined();
    expect(screen.getByText('Recent progression')).toBeDefined();
  });

  it('should show locked achievements as a teaser with no counter', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Achievements' }));

    const locked = await screen.findAllByText('Locked');
    expect(locked.length).toBeGreaterThan(0);
    expect(screen.queryByText(/of 17/)).toBeNull();

    fireEvent.click(locked[1] as HTMLElement);
    expect(await screen.findByText(/Locked achievements show no counter and no progress bar/)).toBeDefined();
  });

  it('should move focus to the achievement detail when a tile is selected on narrow layouts', async () => {
    stubNarrowViewport();
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Achievements' }));

    const locked = await screen.findAllByText('Locked');
    fireEvent.click(locked[1] as HTMLElement);

    const heading = await screen.findByRole('heading', { level: 2, name: 'Locked' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('should reveal and focus the achievement detail when a tile is selected with the keyboard', async () => {
    stubNarrowViewport();
    const user = userEvent.setup();
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Achievements' }));

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
    fireEvent.click(await screen.findByRole('tab', { name: 'Achievements' }));

    await screen.findByRole('heading', { level: 2, name: /^(Locked|Earned)$/ });
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });

  it('should change the displayed title to another earned one', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Titles' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Display Anchor Holder' }));
    expect(await screen.findByRole('button', { name: 'Displayed' })).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(await screen.findByText('Anchor Holder')).toBeDefined();
  });

  it('should offer no title action on a hero who has earned none', async () => {
    renderScreen(<HeroScreen />, { today: TODAY, persona: 'new' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Titles' }));
    expect(await screen.findByText('No titles yet')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Display / })).toBeNull();
  });

  it('should refuse a cosmetic the coin balance cannot reach, without blame', async () => {
    renderScreen(<HeroScreen />, { today: TODAY, persona: 'new' });
    fireEvent.click(await screen.findByRole('tab', { name: 'Cosmetics' }));

    expect(await screen.findByText('150 coins, and you have 0. It waits here until the balance reaches it.')).toBeDefined();
    const action = screen.getByRole('button', { name: '150 more coins' });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it('should equip a cosmetic the coin balance covers and spend the coins', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Cosmetics' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock for 100 ◈' }));
    expect((await screen.findAllByText('◈ 212')).length).toBeGreaterThan(0);
  });

  it('should never price a cosmetic that comes from an achievement', async () => {
    renderScreen(<HeroScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('tab', { name: 'Cosmetics' }));
    expect(await screen.findByText('Comes with an achievement, never with coins.')).toBeDefined();
  });
});

describe('Recovery screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should state what was lost and what was not', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });
    expect(await screen.findByRole('heading', { name: 'Coming back' })).toBeDefined();
    expect(await screen.findByText(/No XP was removed, no level was lost/)).toBeDefined();
    expect(screen.getByText('Open choices')).toBeDefined();
  });

  it('should let intensity be lowered without touching earned experience', async () => {
    renderScreen(<RecoveryScreen />, { today: TODAY, persona: 'recovery' });
    const gentle = await screen.findByRole('button', { name: /Gentle/ });
    expect(gentle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Demanding/ }));
    expect((await screen.findByRole('button', { name: /Demanding/ })).getAttribute('aria-pressed')).toBe('true');
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
