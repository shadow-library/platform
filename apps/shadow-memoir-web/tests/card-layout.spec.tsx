import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlanningBoardScreen } from '@/features/planning';
import { QuestListScreen } from '@/features/quests';
import { SettingsScreen } from '@/features/settings';
import { TodayScreen } from '@/features/today';

import { renderScreen } from './harness';

function readCss(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8');
}

describe('card layout', () => {
  it("should render every memoir card's content inside Card.Body", async () => {
    renderScreen(<TodayScreen />);
    const streaks = await screen.findByText('Streaks');
    expect(streaks.closest('[data-padding]')).not.toBeNull();

    const comingUp = await screen.findByText('Coming up');
    expect(comingUp.closest('[data-padding]')).not.toBeNull();
  });

  it('should keep quest list rows flush inside a padded Card.Body', async () => {
    renderScreen(<QuestListScreen />);
    const rows = await screen.findAllByRole('link');
    const questRow = rows.find(row => row.getAttribute('href')?.startsWith('/quests/'));
    expect(questRow).toBeDefined();
    expect(questRow?.closest('[data-padding]')).not.toBeNull();
  });

  it("should render settings' Jump to links inside Card.Body", async () => {
    renderScreen(<SettingsScreen />);
    const jumpLink = await screen.findByRole('link', { name: /Notifications/ });
    expect(jumpLink.closest('[data-padding]')).not.toBeNull();
  });

  it('should render planning day items inside a padded Card.Body', async () => {
    renderScreen(<PlanningBoardScreen />, { today: '2026-08-22' });
    await screen.findByRole('heading', { name: 'Reschedule budget' });
    const links = screen.getAllByRole('link');
    const dayItem = links.find(link => link.getAttribute('href')?.startsWith('/quests/'));
    expect(dayItem).toBeDefined();
    expect(dayItem?.closest('[data-padding]')).not.toBeNull();
  });

  it('should expose a focus-visible style on quest rows, day items and jump links', () => {
    const quests = readCss('../src/features/quests/quests.module.css');
    expect(quests).toMatch(/\.questRow:focus-visible\s*{[^}]*outline:[^}]*var\(--sh-focus-ring\)/);
    expect(quests).toMatch(/\.strictnessCard:focus-visible\s*{[^}]*outline:[^}]*var\(--sh-focus-ring\)/);
    expect(quests).toMatch(/\.dayToggle:focus-visible\s*{[^}]*outline:[^}]*var\(--sh-focus-ring\)/);

    const planning = readCss('../src/features/planning/planning.module.css');
    expect(planning).toMatch(/\.dayItem:focus-visible\s*{[^}]*outline:[^}]*var\(--sh-focus-ring\)/);

    const settings = readCss('../src/features/settings/settings.module.css');
    expect(settings).toMatch(/\.jumpItem:focus-visible\s*{[^}]*outline:[^}]*var\(--sh-focus-ring\)/);
  });

  it('should keep wrapped screen header actions on the right edge instead of indenting them under the title', () => {
    const layout = readCss('../src/components/ScreenLayout.module.css');
    expect(layout).toMatch(/\.actions\s*{[^}]*margin-inline-start:\s*auto;/);
  });

  it('should keep the list card overflow clip from reaching the row focus ring', () => {
    const quests = readCss('../src/features/quests/quests.module.css');
    expect(quests).toMatch(/\.questRow:focus-visible\s*{[^}]*outline-offset:\s*-\d+px/);

    const today = readCss('../src/features/today/today.module.css');
    expect(today).toMatch(/\.listCard\s*{\s*overflow:\s*hidden;\s*}/);
  });
});
