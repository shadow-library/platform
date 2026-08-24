import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OnboardingScreen } from '@/features/onboarding';
import { AppSyncScreen, BillingScreen, DeleteAccountScreen, ExportScreen, NotificationSettingsScreen, SettingsScreen } from '@/features/settings';
import { OnboardingGate } from '@/routes/_app';

import { renderScreen } from './harness';

const TODAY = '2026-08-22';

describe('Settings screen', () => {
  it('should render the day, appearance and data sections', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(await screen.findByText('Day and money')).toBeDefined();
    expect(screen.getByText('Appearance and behaviour')).toBeDefined();
    expect(screen.getByText('Data and privacy')).toBeDefined();
  });

  it('should keep the home currency fixed once it has been set', async () => {
    renderScreen(<SettingsScreen />, { today: TODAY });
    const currency = await screen.findByLabelText('Home currency');
    expect(currency.getAttribute('data-disabled')).not.toBeNull();
    expect(await screen.findByText(/Fixed when you set up/)).toBeDefined();
  });
});

describe('Notification preferences', () => {
  it('should ship every category off', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeDefined();

    const switches = await screen.findAllByRole('switch');
    expect(switches.length).toBe(4);
    for (const control of switches) expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('should turn one category on without touching the others', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    fireEvent.click(await screen.findByRole('switch', { name: 'Weekly review by email' }));

    expect((await screen.findByRole('switch', { name: 'Weekly review by email' })).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Billing reminders by email' }).getAttribute('aria-checked')).toBe('false');
  });

  it('should promise never to notify about a missed quest', async () => {
    renderScreen(<NotificationSettingsScreen />, { today: TODAY });
    expect(await screen.findByText(/will not notify you about a missed quest/)).toBeDefined();
  });
});

describe('Plan and billing', () => {
  it('should sell coaching volume and nothing about the game', async () => {
    renderScreen(<BillingScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Plan and billing' })).toBeDefined();
    expect(await screen.findByText('What money does not buy')).toBeDefined();
    expect(screen.getByText('No XP, HP, shields or cosmetics — not now, not later')).toBeDefined();
  });

  it('should send cancellation to the payment provider rather than pretending to own it', async () => {
    renderScreen(<BillingScreen />, { today: TODAY });
    expect(await screen.findByText(/no route that can write your plan/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cancel the plan' })).toBeNull();
  });
});

describe('Data export', () => {
  it('should prepare an archive without changing anything', async () => {
    renderScreen(<ExportScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Data export' })).toBeDefined();

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare the export' }));
    expect(await screen.findByText('Preparing')).toBeDefined();
    expect(await screen.findByText(/You can leave this page/)).toBeDefined();
  });
});

describe('Account deletion', () => {
  it('should keep the deletion inert until both statements are acknowledged', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'Delete your data' })).toBeDefined();
    expect((screen.getByRole('button', { name: 'Continue to confirmation' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('should stop at the re-authentication boundary rather than scheduling anything', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });

    for (const box of await screen.findAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to confirmation' }));

    expect(await screen.findByText('Confirm it is you, on your Shadow account')).toBeDefined();
    expect(await screen.findByText(/Nothing is scheduled and nothing is erased until that confirmation comes back/)).toBeDefined();
    expect(screen.queryByText(/Deletion scheduled/)).toBeNull();
  });

  it('should offer lighter options than deletion', async () => {
    renderScreen(<DeleteAccountScreen />, { today: TODAY });
    expect(await screen.findByText('Pause instead')).toBeDefined();
  });
});

describe('App and sync', () => {
  it('should show the queue, the devices and what still works offline', async () => {
    renderScreen(<AppSyncScreen />, { today: TODAY });
    expect(await screen.findByRole('heading', { name: 'App and sync' })).toBeDefined();
    expect(await screen.findByText('Expense €18.40 · Groceries')).toBeDefined();
    expect(screen.getByText('Chrome · MacBook')).toBeDefined();
    expect(screen.getByText('What works offline')).toBeDefined();
  });

  it('should have nothing waiting on a fresh account', async () => {
    renderScreen(<AppSyncScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByText('Nothing is waiting')).toBeDefined();
  });
});

describe('Onboarding', () => {
  it('should walk five steps and end on a reviewable first quest', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    expect(await screen.findByRole('heading', { name: 'Set up' })).toBeDefined();
    expect(screen.getByText('Step 1 of 5')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Which part of you does it grow?')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Read 10 pages'), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your week would look like this')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Shields cover the days you could not help')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('Walk 20 minutes')).toBeDefined();
    expect(screen.getByText('Step 5 of 5')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create it and start' })).toBeDefined();
  });

  it('should route an un-onboarded account to setup before anything else renders', async () => {
    const { router } = renderScreen(
      <OnboardingGate>
        <div>Today screen</div>
      </OnboardingGate>,
      { today: TODAY, persona: 'new' },
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  it('should let an onboarded account through the gate untouched', async () => {
    renderScreen(
      <OnboardingGate>
        <div>Today screen</div>
      </OnboardingGate>,
      { today: TODAY },
    );

    expect(await screen.findByText('Today screen')).toBeDefined();
  });

  it('should let a new account choose its home currency', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    const currency = await screen.findByLabelText('Home currency');
    expect(currency.getAttribute('data-disabled')).toBeNull();
    expect(await screen.findByText(/this stays fixed afterwards/)).toBeDefined();
  });

  it('should lock the home currency once onboarding has been completed', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY });
    expect(await screen.findByText('Already set, and fixed from here so your totals stay comparable.')).toBeDefined();
    expect((await screen.findByLabelText('Home currency')).getAttribute('data-disabled')).not.toBeNull();
  });
});
