import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, Dialog } from './Dialog';

describe('Dialog', () => {
  it('opens from its trigger with the title as the accessible name', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <Dialog.Trigger>New environment</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header title="New environment" description="Environments isolate config." />
          <Dialog.Body>body</Dialog.Body>
        </Dialog.Content>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'New environment' }));
    expect(screen.getByRole('dialog', { name: 'New environment' })).toBeInTheDocument();
    expect(screen.getByText('Environments isolate config.')).toBeInTheDocument();
  });

  it('should set data-size from the size prop', () => {
    render(
      <Dialog defaultOpen>
        <Dialog.Content size="xl">
          <Dialog.Header title="Review" />
        </Dialog.Content>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Review' })).toHaveAttribute('data-size', 'xl');
  });

  it('closes through the close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <Dialog.Content>
          <Dialog.Header title="Settings" />
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
          <Dialog.Header title="New environment" showClose={false} />
          <Dialog.Footer cancel="Cancel" action="Create environment" onAction={onAction} />
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
    render(<ConfirmDialog defaultOpen title="Archive project?" confirmLabel="Archive" onConfirm={onConfirm} />);
    expect(screen.getByRole('alertdialog', { name: 'Archive project?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('gates the action until the resource name is typed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog defaultOpen intent="danger" title="Delete workspace?" confirmLabel="Delete workspace" typedConfirmation="acme-prod" onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Delete workspace' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Type acme-prod to confirm' }), 'acme-prod');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should close at once for a confirm that returns nothing, as it always has', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog defaultOpen title="Archive project?" confirmLabel="Archive" onOpenChange={onOpenChange} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('should keep a controlled dialog driven by its open prop', async () => {
    const user = userEvent.setup();
    function Controlled(): React.JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ConfirmDialog open={open} onOpenChange={setOpen} title="Archive project?" confirmLabel="Archive" />
        </>
      );
    }
    render(<Controlled />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('alertdialog', { name: 'Archive project?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  describe('with an async confirm', () => {
    function deferred(): { promise: Promise<void>; resolve: () => void; reject: (cause: Error) => void } {
      let resolve!: () => void;
      let reject!: (cause: Error) => void;
      const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      return { promise, resolve, reject };
    }

    it('should stay open and loading until the promise resolves, then close', async () => {
      const user = userEvent.setup();
      const work = deferred();
      const onOpenChange = vi.fn();
      render(<ConfirmDialog defaultOpen title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByRole('alertdialog', { name: 'Remove member?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Remove/ })).toHaveAttribute('aria-busy', 'true');
      expect(onOpenChange).not.toHaveBeenCalled();

      await act(async () => work.resolve());

      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });

    it('should stay open and ready to retry when the promise rejects', async () => {
      const user = userEvent.setup();
      const work = deferred();
      const onOpenChange = vi.fn();
      render(<ConfirmDialog defaultOpen title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await act(async () => work.reject(new Error('Forbidden')));

      expect(screen.getByRole('alertdialog', { name: 'Remove member?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove' })).not.toHaveAttribute('aria-busy');
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('should ignore repeat presses while the promise is pending', async () => {
      const user = userEvent.setup();
      const work = deferred();
      const onConfirm = vi.fn(() => work.promise);
      render(<ConfirmDialog defaultOpen title="Remove member?" confirmLabel="Remove" onConfirm={onConfirm} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: /Remove/ }));

      expect(onConfirm).toHaveBeenCalledOnce();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      await act(async () => work.resolve());
    });

    it('should hold off Cancel and Escape while the promise is pending', async () => {
      const user = userEvent.setup();
      const work = deferred();
      const onOpenChange = vi.fn();
      render(<ConfirmDialog defaultOpen title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      await user.keyboard('{Escape}');

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
      await act(async () => work.resolve());
    });

    it('should keep focus on the confirm button while pending', async () => {
      const user = userEvent.setup();
      const work = deferred();
      render(<ConfirmDialog defaultOpen title="Remove member?" confirmLabel="Remove" onConfirm={() => work.promise} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByRole('button', { name: /Remove/ })).toHaveFocus();
      await act(async () => work.resolve());
    });

    it('should not carry a pending confirm into the next opening after the parent closes it', async () => {
      const user = userEvent.setup();
      const work = deferred();
      const onOpenChange = vi.fn();
      const { rerender } = render(<ConfirmDialog open title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));
      rerender(<ConfirmDialog open={false} title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);
      rerender(<ConfirmDialog open title="Remove member?" confirmLabel="Remove" onOpenChange={onOpenChange} onConfirm={() => work.promise} />);

      expect(screen.getByRole('button', { name: 'Remove' })).not.toHaveAttribute('aria-busy');
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

      await act(async () => work.resolve());

      expect(screen.getByRole('alertdialog', { name: 'Remove member?' })).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
