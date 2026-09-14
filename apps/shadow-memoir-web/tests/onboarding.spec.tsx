import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@shadow-library/web';

import { OnboardingScreen } from '@/features/onboarding';
import { type AccountCommand, type Command, commandRefusal, type CommandResult, type DispatchOptions, type QuestDraft, type SettledCommandResult } from '@/lib/data';

import { createMemoirTestData, renderScreen } from './harness';
import { withTimeZone } from './setup';

const TODAY = '2026-08-22';

const NAME_PLACEHOLDER = 'e.g. Read 10 pages';

async function goToReview(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Walk 20 minutes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  await screen.findByText('Step 5 of 5');
}

function recordCommands(data: ReturnType<typeof createMemoirTestData>): { onboarding: AccountCommand[]; quests: Command[] } {
  const calls = { onboarding: [] as AccountCommand[], quests: [] as Command[] };
  const dispatchAccount = data.account.dispatchCommand;
  data.account.dispatchCommand = (command: AccountCommand): Promise<SettledCommandResult> => {
    if (command.type === 'onboarding.complete') calls.onboarding.push(command);
    return dispatchAccount(command);
  };
  const dispatchQuest = data.provider.dispatchCommand.bind(data.provider);
  data.provider.dispatchCommand = (command: Command, options?: DispatchOptions): Promise<CommandResult> => {
    if (command.type === 'quest.create') calls.quests.push(command);
    return dispatchQuest(command, options);
  };
  return calls;
}

function createdDraft(quests: Command[]): QuestDraft | undefined {
  const created = quests.find(command => command.type === 'quest.create');
  return created?.type === 'quest.create' ? created.draft : undefined;
}

describe('OnboardingScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should send one onboarding request when submit is clicked repeatedly', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const calls = recordCommands(data);

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();

    const submit = screen.getByRole('button', { name: 'Create it and start' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(calls.quests).toHaveLength(1));
    expect(calls.onboarding).toHaveLength(1);
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
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('radio', { name: /^Anchor/ }));
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
    const name = screen.getByPlaceholderText(NAME_PLACEHOLDER);
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

  it('should default the time zone to the browser zone', async () => {
    await withTimeZone('Asia/Dubai', async () => {
      const data = createMemoirTestData({ today: TODAY, persona: 'new' });
      const calls = recordCommands(data);

      renderScreen(<OnboardingScreen />, { value: data });
      expect(await screen.findByText('Detected from your browser. Travel will not move your day unless you change it.')).toBeDefined();
      await goToReview();
      fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));

      await waitFor(() => expect(calls.onboarding).toHaveLength(1));
      expect(calls.onboarding[0]).toMatchObject({ submission: { timezone: 'Asia/Dubai' } });
    });
  });

  it('should block continuing without a name', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Name the promise to continue.')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Name the promise — for example, read 10 pages.')).toBeDefined();
  });

  it('should block continuing with no days chosen', async () => {
    renderScreen(<OnboardingScreen />, { today: TODAY, persona: 'new' });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) fireEvent.click(screen.getByRole('button', { name: day }));

    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Choose at least one day.');
    expect(screen.getByText('Two minutes, and no tour afterwards.')).toBeDefined();
  });

  it('should create a times-a-week quest as weekly', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const calls = recordCommands(data);

    renderScreen(<OnboardingScreen />, { value: data });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Walk 20 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Times a week' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Days a week' }), { key: 'ArrowLeft' });

    expect(screen.getByText('3 days a week · about 30 minutes of promises. Light enough to keep on a bad week.')).toBeDefined();
    expect(screen.getByText('Spread across your week on Mon, Wed, Fri. Choose the exact days with Chosen days.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('3 days a week')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));

    await waitFor(() => expect(calls.quests).toHaveLength(1));
    expect(createdDraft(calls.quests)?.recurrence).toMatchObject({ frequency: 'weekly', daysOfWeek: ['mon', 'wed', 'fri'] });
  });

  it('should not promise Today when the quest is not scheduled today', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 8, 13, 10, 0) });
    const data = createMemoirTestData({ today: '2026-09-13', persona: 'new' });

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();

    expect(screen.getByText('Starts Monday · your Today screen stays clear until then')).toBeDefined();
    expect(screen.queryByText(/on your Today screen as soon as you start/)).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Ready · One quest, starting Monday, with nothing else in the way.');
  });

  it('should lock the saved day settings when only the first quest failed', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    data.provider.dispatchCommand = async (): Promise<CommandResult> => ({ status: 'rejected', message: 'Anchor quests need a start time.' });

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));
    await screen.findByText('Anchor quests need a start time.');

    for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('Step 1 of 5')).toBeDefined();
    expect((screen.getByRole('combobox', { name: 'Timezone' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: 'Home currency' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/These are already saved/)).toBeDefined();
  });

  it('should read back the saved day and currency when setup was already finished elsewhere', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const shippedDay = await data.account.getDay();
    let finishedElsewhere = false;
    data.account.getDay = async () =>
      finishedElsewhere ? { ...shippedDay, wakeTime: '05:45', sleepTime: '21:15', timezone: 'Asia/Tokyo', currency: 'NOK', currencyLocked: true } : shippedDay;
    data.account.dispatchCommand = async (): Promise<SettledCommandResult> => {
      finishedElsewhere = true;
      return { status: 'rejected', message: 'Setup was already finished for this account.', error: { code: 'ACC_003', kind: 'refusal' } };
    };
    data.provider.dispatchCommand = async (): Promise<CommandResult> => ({ status: 'rejected', message: 'Anchor quests need a start time.' });

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));
    await screen.findByText('Anchor quests need a start time.');
    expect(screen.getByText('NOK · fixed from here, so your totals stay comparable')).toBeDefined();

    for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('Step 1 of 5')).toBeDefined();
    expect((screen.getByRole('combobox', { name: 'Wake time' }) as HTMLInputElement).value).toBe('05:45');
    expect((screen.getByRole('combobox', { name: 'Sleep time' }) as HTMLInputElement).value).toBe('21:15');
    expect(screen.getByRole('combobox', { name: 'Timezone' }).textContent).toMatch(/Tokyo/);
    expect(screen.getByRole('combobox', { name: 'Home currency' }).textContent).toContain('NOK');
    expect(screen.getByText(/These are already saved/)).toBeDefined();
  });

  it('should say the saved day could not be read back rather than present this device’s values as saved', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const shippedDay = await data.account.getDay();
    let finishedElsewhere = false;
    data.account.getDay = async () => {
      if (finishedElsewhere) throw new ApiError(-1, { code: 'API_REQUEST_NETWORK_ERROR', type: 'NetworkError', message: 'Network error' });
      return shippedDay;
    };
    data.account.dispatchCommand = async (): Promise<SettledCommandResult> => {
      finishedElsewhere = true;
      return { status: 'rejected', message: 'Setup was already finished for this account.', error: { code: 'ACC_003', kind: 'refusal' } };
    };
    data.provider.dispatchCommand = async (): Promise<CommandResult> => ({ status: 'rejected', message: 'Anchor quests need a start time.' });

    renderScreen(<OnboardingScreen />, { value: data });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));
    await screen.findByText('Anchor quests need a start time.');

    for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText(/couldn’t be loaded on this device yet/)).toBeDefined();
    expect(screen.queryByText(/These are already saved/)).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Home currency' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('should show owner copy with a retry when setup cannot be saved', async () => {
    const data = createMemoirTestData({ today: TODAY, persona: 'new' });
    const dispatchAccount = data.account.dispatchCommand;
    const failures = [new ApiError(500, { code: 'UNKNOWN', type: 'UnknownError', message: 'Unknown Error' })];
    const onboardingCalls: AccountCommand[] = [];
    data.account.dispatchCommand = async (command: AccountCommand): Promise<SettledCommandResult> => {
      if (command.type !== 'onboarding.complete') return dispatchAccount(command);
      onboardingCalls.push(command);
      const failure = failures.shift();
      return failure ? commandRefusal(failure, 'That could not be saved.') : dispatchAccount(command);
    };

    const { router } = renderScreen(<OnboardingScreen />, { value: data, initialPath: '/onboarding' });
    await goToReview();
    fireEvent.click(screen.getByRole('button', { name: 'Create it and start' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Setup wasn’t saved');
    expect(alert.textContent).toContain('That could not be saved.');
    expect(alert.textContent).toContain('Nothing was changed. Check your connection and try again.');
    expect(screen.queryByText(/Unknown Error/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(onboardingCalls).toHaveLength(2);
  });
});
