/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { ConfirmDialog, Dialog } from './Dialog';

/**
 * Declaring the constants
 */

describe('Dialog', () => {
  it('opens from its trigger with the title as the accessible name', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <Dialog.Trigger>New environment</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header title='New environment' description='Environments isolate config.' />
          <Dialog.Body>body</Dialog.Body>
        </Dialog.Content>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'New environment' }));
    expect(screen.getByRole('dialog', { name: 'New environment' })).toBeInTheDocument();
    expect(screen.getByText('Environments isolate config.')).toBeInTheDocument();
  });

  it('closes through the close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <Dialog.Content>
          <Dialog.Header title='Settings' />
        </Dialog.Content>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fires onAction from the footer primary', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Dialog defaultOpen>
        <Dialog.Content>
          <Dialog.Header title='New environment' showClose={false} />
          <Dialog.Footer cancel='Cancel' action='Create environment' onAction={onAction} />
        </Dialog.Content>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Create environment' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('renders as an alertdialog and confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog defaultOpen title='Archive project?' confirmLabel='Archive' onConfirm={onConfirm} />);
    expect(screen.getByRole('alertdialog', { name: 'Archive project?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('gates the action until the resource name is typed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog defaultOpen intent='danger' title='Delete workspace?' confirmLabel='Delete workspace' typedConfirmation='acme-prod' onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Delete workspace' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Type acme-prod to confirm' }), 'acme-prod');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
