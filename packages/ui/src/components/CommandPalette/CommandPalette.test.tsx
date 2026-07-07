/**
 * Importing npm packages
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { CommandPalette } from './CommandPalette';
import { type CommandItem } from './CommandPalette.types';

/**
 * Declaring the constants
 */
function makeCommands(): CommandItem[] {
  return [
    { id: 'restart', group: 'Actions', label: 'Restart service', onRun: vi.fn() },
    { id: 'deploy', group: 'Actions', label: 'Deploy', onRun: vi.fn() },
    { id: 'settings', group: 'Pages', label: 'Settings', onRun: vi.fn() },
  ];
}

describe('CommandPalette', () => {
  it('renders grouped commands when open', () => {
    render(<CommandPalette open onOpenChange={() => {}} commands={makeCommands()} />);
    expect(screen.getByRole('combobox', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Restart service/ })).toBeInTheDocument();
  });

  it('filters commands by query', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onOpenChange={() => {}} commands={makeCommands()} />);
    await user.type(screen.getByRole('combobox'), 'settings');
    expect(screen.getByRole('option', { name: /Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Restart/ })).not.toBeInTheDocument();
  });

  it('runs the highlighted command on Enter and closes', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} commands={[{ id: 'a', group: 'Actions', label: 'Restart service', onRun }]} />);
    await user.type(screen.getByRole('combobox'), 'restart');
    await user.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('runs a command on click', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<CommandPalette open onOpenChange={() => {}} commands={[{ id: 'a', group: 'Actions', label: 'Deploy', onRun }]} />);
    await user.click(screen.getByRole('option', { name: /Deploy/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows the empty message for no matches', async () => {
    const user = userEvent.setup();
    render(<CommandPalette open onOpenChange={() => {}} commands={makeCommands()} emptyMessage='Nothing here' />);
    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.getByText(/Nothing here/)).toBeInTheDocument();
  });

  it('opens on the mod+k hotkey', () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette commands={makeCommands()} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
