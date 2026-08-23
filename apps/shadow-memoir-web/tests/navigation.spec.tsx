import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type NavLeaf } from '@shadow-library/ui/router';

import { AiScreen } from '@/features/ai';
import { ExpensesScreen, SubscriptionsScreen } from '@/features/finance';
import { HeroScreen } from '@/features/hero';
import { HistoryScreen } from '@/features/history';
import { InsightsScreen } from '@/features/insights';
import { OnboardingScreen } from '@/features/onboarding';
import { PlanningBoardScreen } from '@/features/planning';
import { QuickLogScreen } from '@/features/quick-logs';
import { WeeklyReviewScreen } from '@/features/review';
import { SettingsScreen } from '@/features/settings';
import { DESKTOP_NAV, PHONE_NAV } from '@/features/shell';
import { TodayScreen } from '@/features/today';

function desktopDestinations(): string[] {
  return DESKTOP_NAV.sections.flatMap(section => section.items).map(item => (item as NavLeaf).to);
}

describe('navigation architecture', () => {
  it('should keep the phone bottom bar within three to five destinations', () => {
    expect(PHONE_NAV.length).toBeGreaterThanOrEqual(3);
    expect(PHONE_NAV.length).toBeLessThanOrEqual(5);
  });

  it('should reach every phone destination from the desktop sidebar too', () => {
    const desktop = desktopDestinations();
    for (const item of PHONE_NAV) expect(desktop).toContain(item.to);
  });

  it('should give every destination a distinct path', () => {
    const desktop = desktopDestinations();
    expect(new Set(desktop).size).toBe(desktop.length);
  });
});

describe('screen inventory', () => {
  const screens: [string, () => React.JSX.Element][] = [
    ['Today', TodayScreen],
    ['Planning Board', PlanningBoardScreen],
    ['Quick log', QuickLogScreen],
    ['Money', ExpensesScreen],
    ['Subscriptions', SubscriptionsScreen],
    ['History', HistoryScreen],
    ['Insights', InsightsScreen],
    ['Hero', HeroScreen],
    ['Weekly Review', WeeklyReviewScreen],
    ['Ask', AiScreen],
    ['Settings', SettingsScreen],
    ['Set up', OnboardingScreen],
  ];

  it.each(screens)('should render the %s screen with its heading', (title, Screen) => {
    render(<Screen />);
    expect(screen.getByRole('heading', { name: title })).toBeDefined();
  });
});
