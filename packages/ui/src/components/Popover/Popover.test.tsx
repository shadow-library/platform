/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Popover } from './Popover';

/**
 * Declaring the constants
 */

describe('Popover', () => {
  it('opens on trigger click and reflects aria-expanded', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <Popover.Trigger>Share</Popover.Trigger>
        <Popover.Content>
          <div>Share this dashboard</div>
        </Popover.Content>
      </Popover>,
    );
    expect(screen.queryByText('Share this dashboard')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByText('Share this dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('labels the dialog by its header title', () => {
    render(
      <Popover defaultOpen>
        <Popover.Trigger>Open</Popover.Trigger>
        <Popover.Content>
          <Popover.Header title='Notifications' description='Choose what reaches you.' />
        </Popover.Content>
      </Popover>,
    );
    const dialog = screen.getByRole('dialog');
    const title = screen.getByText('Notifications');
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(screen.getByText('Choose what reaches you.')).toBeInTheDocument();
  });

  it('supports a controlled open state', async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    render(
      <Popover open onOpenChange={handleOpenChange}>
        <Popover.Trigger>Open</Popover.Trigger>
        <Popover.Content>
          <Popover.Close>Done</Popover.Close>
        </Popover.Content>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses aria-label for a headerless popover', () => {
    render(
      <Popover defaultOpen>
        <Popover.Trigger>Open</Popover.Trigger>
        <Popover.Content aria-label='Quick filters'>
          <div>content</div>
        </Popover.Content>
      </Popover>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Quick filters' });
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });
});
