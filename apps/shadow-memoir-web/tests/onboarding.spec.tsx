import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { OnboardingScreen } from '@/features/onboarding';
import { type AccountCommand, type Command, type CommandResult, type DispatchOptions, type SettledCommandResult } from '@/lib/data';

import { createMemoirTestData, renderScreen } from './harness';

const TODAY = '2026-08-22';

async function goToReview(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByPlaceholderText('Read 10 pages'), { target: { value: 'Walk 20 minutes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  await screen.findByText('Step 5 of 5');
}

describe('OnboardingScreen', () => {
  it('should send one onboarding request when submit is clicked repeatedly', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const onboardingCalls: AccountCommand[] = [];
    const questCalls: Command[] = [];
    const dispatchAccount = data.account.dispatchCommand;
    data.account.dispatchCommand = (command: AccountCommand): Promise<SettledCommandResult> => {
      if (command.type === 'onboarding.complete') onboardingCalls.push(command);
      return dispatchAccount(command);
    };
    const dispatchQuest = data.provider.dispatchCommand.bind(data.provider);
    data.provider.dispatchCommand = (command: Command, options?: DispatchOptions): Promise<CommandResult> => {
      if (command.type === 'quest.create') questCalls.push(command);
      return dispatchQuest(command, options);
    };

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();

    const submit = screen.getByRole('button', { name: 'Create it and start' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(questCalls).toHaveLength(1));
    expect(onboardingCalls).toHaveLength(1);
  });

  it('should continue to quest creation when onboarding already completed', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const questCalls: Command[] = [];
    data.account.dispatchCommand = async (command: AccountCommand): Promise<SettledCommandResult> => {
      if (command.type !== 'onboarding.complete') return { status: 'applied', message: '', xpAwarded: 0, coinsAwarded: 0 };
      return { status: 'rejected', message: 'Setup was already finished for this account.', error: { code: 'ACC_003', kind: 'refusal' } };
    };
    const dispatchQuest = data.provider.dispatchCommand.bind(data.provider);
    data.provider.dispatchCommand = (command: Command, options?: DispatchOptions): Promise<CommandResult> => {
      if (command.type === 'quest.create') questCalls.push(command);
      return dispatchQuest(command, options);
    };

    const { router } = renderScreen(<OnboardingScreen />, { value: data, initialPath: '/onboarding' });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(questCalls).toHaveLength(1);
  });

  it('should create the first quest only once', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const questCalls: Command[] = [];
    let resolvePending: (() => void) | undefined;
    const dispatchQuest = data.provider.dispatchCommand.bind(data.provider);
    data.provider.dispatchCommand = (command: Command, options?: DispatchOptions): Promise<CommandResult> => {
      if (command.type !== 'quest.create') return dispatchQuest(command, options);
      questCalls.push(command);
      return new Promise<CommandResult>(resolve => {
        resolvePending = () => resolve({ status: 'applied', message: 'Walk 20 minutes is in your plan.', xpAwarded: 0, coinsAwarded: 0 });
      });
    };

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();

    const submit = screen.getByRole('button', { name: 'Create it and start' });
    fireEvent.click(submit);
    await waitFor(() => expect(questCalls).toHaveLength(1));
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(questCalls).toHaveLength(1);

    resolvePending?.();
    await waitFor(() => expect(questCalls).toHaveLength(1));
  });

  it('should require a start time for anchor strictness', async () => {
    const user = userEvent.setup();
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByPlaceholderText('Read 10 pages'), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: /^Anchor/ }));
    const review = screen.getByRole('button', { name: 'Review' });
    expect((review as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Choose a start time to continue.')).toBeDefined();

    const time = screen.getByRole('combobox', { name: 'Start time' });
    await user.clear(time);
    await user.type(time, '07:15{Enter}');

    expect((review as HTMLButtonElement).disabled).toBe(false);
  });

  it('should move focus to the step heading when the step changes', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Your first quest');
    expect(document.activeElement).toBe(heading);
  });

  it('should submit the name step with Enter', async () => {
    const user = userEvent.setup();
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    const name = screen.getByPlaceholderText('Read 10 pages');
    await user.type(name, 'Walk 20 minutes{Enter}');

    expect(await screen.findByText('Your week would look like this')).toBeDefined();
  });

  it('should stay on the review step with an error when the first quest is rejected', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const onboardingCalls: AccountCommand[] = [];
    const dispatchAccount = data.account.dispatchCommand;
    data.account.dispatchCommand = (command: AccountCommand): Promise<SettledCommandResult> => {
      if (command.type === 'onboarding.complete') onboardingCalls.push(command);
      return dispatchAccount(command);
    };
    data.provider.dispatchCommand = async (): Promise<CommandResult> => ({ status: 'rejected', message: 'Anchor quests need a start time.' });

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));

    expect(await screen.findByText('Anchor quests need a start time.')).toBeDefined();
    expect(screen.getByText('Step 5 of 5')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Create it and start' })).toBeDefined();
    expect(onboardingCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));
    await waitFor(() => expect(onboardingCalls).toHaveLength(1));
  });
});
