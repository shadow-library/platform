import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@shadow-library/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuestBuilderScreen, QuestEditorScreen, QuestEditScreen } from '@/features/quests';
import { type Command, type CommandResult, type DispatchOptions, type MemoirData } from '@/lib/data';

import { createMemoirTestData, renderScreen } from './harness';

const TODAY = '2026-08-22';

function recordCommands(data: MemoirData, respond?: (command: Command) => Promise<CommandResult> | undefined): Command[] {
  const commands: Command[] = [];
  const dispatch = data.provider.dispatchCommand.bind(data.provider);
  data.provider.dispatchCommand = (command: Command, options?: DispatchOptions): Promise<CommandResult> => {
    commands.push(command);
    return respond?.(command) ?? dispatch(command, options);
  };
  return commands;
}

function createButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Create quest' }) as HTMLButtonElement;
}

describe('QuestBuilderScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should describe every-N-days drafts with N in the preview', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });

    fireEvent.click(await screen.findByRole('radio', { name: 'Every N days' }));
    expect(await screen.findByText('Every 2 days — 4 times in the next 7 days.')).toBeDefined();

    const interval = screen.getByRole('spinbutton', { name: 'Repeat every N days' });
    fireEvent.change(interval, { target: { value: '5' } });
    expect(await screen.findByText('Every 5 days — 2 times in the next 7 days.')).toBeDefined();

    fireEvent.change(interval, { target: { value: '99' } });
    fireEvent.blur(interval);
    expect(interval).toHaveProperty('value', '30');
    expect(await screen.findByText('Every 30 days — 1 time in the next 7 days.')).toBeDefined();
  });

  it('should leave the preview without a cadence note for weekday drafts', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });

    expect(await screen.findByRole('heading', { name: 'Effect on your week' })).toBeDefined();
    expect(screen.queryByText(/in the next 7 days/)).toBeNull();
  });

  it('should explain why creation is blocked while the name is empty', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });

    const name = await screen.findByLabelText('Quest name');
    expect(createButton().disabled).toBe(true);
    expect(screen.getByText('Give the quest a name.')).toBeDefined();

    fireEvent.change(name, { target: { value: 'Read' } });
    fireEvent.change(name, { target: { value: '   ' } });
    expect(screen.getAllByText('Give the quest a name.')).toHaveLength(2);
    expect(createButton().disabled).toBe(true);
  });

  it('should block creating a quest with no days', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });

    fireEvent.change(await screen.findByLabelText('Quest name'), { target: { value: 'Read 20 pages' } });
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) fireEvent.click(screen.getByRole('button', { name: day }));

    expect(createButton().disabled).toBe(true);
    expect(screen.getAllByText('Pick at least one day.').length).toBeGreaterThan(0);
    expect(screen.queryByText('Six days a week is the pattern most people keep.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Wed' }));
    expect(createButton().disabled).toBe(false);
  });

  it('should block creating a quest whose usual length is out of range', async () => {
    renderScreen(<QuestBuilderScreen />, { today: TODAY });

    fireEvent.change(await screen.findByLabelText('Quest name'), { target: { value: 'Read 20 pages' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Usual length in minutes' }), { target: { value: '500' } });

    expect(screen.getByText('Between 0 and 240 minutes.')).toBeDefined();
    expect(createButton().disabled).toBe(true);
  });

  it('should create one quest on double click', async () => {
    const data = createMemoirTestData({ today: TODAY });
    let settle: (() => void) | undefined;
    const commands = recordCommands(data, command =>
      command.type === 'quest.create'
        ? new Promise<CommandResult>(resolve => {
            settle = () => resolve({ status: 'applied', message: 'Read 20 pages is in your plan.', xpAwarded: 0, coinsAwarded: 0 });
          })
        : undefined,
    );
    const { router } = renderScreen(<QuestBuilderScreen />, { value: data, initialPath: '/quests/new' });

    fireEvent.change(await screen.findByLabelText('Quest name'), { target: { value: 'Read 20 pages' } });
    const create = createButton();
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() => expect(create.disabled).toBe(true));
    fireEvent.click(create);

    settle?.();
    await waitFor(() => expect(router.state.location.pathname).toBe('/quests'));
    expect(commands.filter(command => command.type === 'quest.create')).toHaveLength(1);
  });

  it('should keep the draft when creation is rejected', async () => {
    const warning = vi.spyOn(toast, 'warning');
    const neutral = vi.spyOn(toast, 'neutral');
    const success = vi.spyOn(toast, 'success');
    const data = createMemoirTestData({ today: TODAY });
    recordCommands(data, command =>
      command.type === 'quest.create'
        ? Promise.resolve({ status: 'rejected', message: 'You already have a quest with this name.', error: { code: 'CMD_002', kind: 'refusal' } })
        : undefined,
    );
    const { router } = renderScreen(<QuestBuilderScreen />, { value: data, initialPath: '/quests/new' });

    fireEvent.change(await screen.findByLabelText('Quest name'), { target: { value: 'Rejected quest' } });
    fireEvent.click(createButton());

    expect(await screen.findByText('Quest not created')).toBeDefined();
    expect(screen.getByText('You already have a quest with this name.')).toBeDefined();
    expect(warning).toHaveBeenCalled();
    expect(neutral).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/quests/new');
    expect((screen.getByLabelText('Quest name') as HTMLInputElement).value).toBe('Rejected quest');
    expect(await data.provider.listQuests('all')).not.toContainEqual(expect.objectContaining({ quest: expect.objectContaining({ name: 'Rejected quest' }) }));
  });
});

describe('QuestEditScreen', () => {
  it('should link to the edit form from the quest details', async () => {
    renderScreen(<QuestEditorScreen questId="morning-run" />, { today: TODAY });

    expect((await screen.findByRole('link', { name: 'Edit quest' })).getAttribute('href')).toBe('/quests/morning-run/edit');
  });

  it('should show not found when editing an unknown quest', async () => {
    renderScreen(<QuestEditScreen questId="does-not-exist" />, { today: TODAY });

    expect(await screen.findByText('This quest isn’t here')).toBeDefined();
    expect(screen.queryByLabelText('Quest name')).toBeNull();
  });

  it('should save quest edits', async () => {
    const data = createMemoirTestData({ today: TODAY });
    const commands = recordCommands(data);
    const { router } = renderScreen(<QuestEditScreen questId="morning-run" />, { value: data, initialPath: '/quests/morning-run/edit' });

    const name = (await screen.findByLabelText('Quest name')) as HTMLInputElement;
    expect(name.value).toBe('Morning run — 5 km');
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(name, { target: { value: 'Morning run — 6 km' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/quests/morning-run'));
    expect(commands).toEqual([{ type: 'quest.update', questId: 'morning-run', patch: { name: 'Morning run — 6 km' } }]);
    expect((await data.provider.getQuest('morning-run')).quest.name).toBe('Morning run — 6 km');
  });

  it("should disable schedule and strictness while today's plan is locked", async () => {
    const data = createMemoirTestData({ today: TODAY });
    const commands = recordCommands(data);
    renderScreen(<QuestEditScreen questId="strength-session" />, { value: data, initialPath: '/quests/strength-session/edit' });

    const name = await screen.findByLabelText('Quest name');
    expect(screen.getByText('Schedule and strictness are read-only today')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Routine/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Tue' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Time of day' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Every N days' }).hasAttribute('disabled')).toBe(true);
    expect(name.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('switch', { name: /health threshold/ })).toBeNull();

    fireEvent.change(name, { target: { value: 'Strength session — heavy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({ type: 'quest.update', questId: 'strength-session', patch: { name: 'Strength session — heavy' } });
  });

  it('should keep schedule and strictness editable when the plan is not locked', async () => {
    renderScreen(<QuestEditScreen questId="morning-run" />, { today: TODAY });

    await screen.findByLabelText('Quest name');
    expect(screen.queryByText('Schedule and strictness are read-only today')).toBeNull();
    expect(screen.getByRole('button', { name: /^Anchor/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Sun' }).hasAttribute('disabled')).toBe(false);
  });
});
