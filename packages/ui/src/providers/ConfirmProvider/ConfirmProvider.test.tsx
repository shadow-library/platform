import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmProvider, useConfirm } from './ConfirmProvider';
import { type ConfirmFn, type ConfirmOptions } from './ConfirmProvider.types';

function Asker({ options, onResult, onConfirm }: { options: ConfirmOptions; onResult?: (confirmed: boolean) => void; onConfirm?: (confirm: ConfirmFn) => void }): ReactElement {
  const confirm = useConfirm();
  onConfirm?.(confirm);
  return (
    <button type="button" onClick={() => void confirm(options).then(onResult)}>
      Ask
    </button>
  );
}

function renderAsker(options: ConfirmOptions, onResult = vi.fn()) {
  render(
    <ConfirmProvider>
      <Asker options={options} onResult={onResult} />
    </ConfirmProvider>,
  );
  return { onResult, user: userEvent.setup() };
}

describe('ConfirmProvider', () => {
  it('should resolve true when the question is confirmed', async () => {
    const { onResult, user } = renderAsker({ title: 'Delete sender?', confirmLabel: 'Delete', intent: 'danger' });
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete sender?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('should resolve false when the question is cancelled', async () => {
    const { onResult, user } = renderAsker({ title: 'Publish?' });
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('should keep ConfirmDialog defaults when the caller names no verb', async () => {
    const { user } = renderAsker({ title: 'Publish?' });
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('should resolve a superseded question as false', async () => {
    let confirm: ConfirmFn | undefined;
    render(
      <ConfirmProvider>
        <Asker options={{ title: 'First?' }} onConfirm={fn => (confirm = fn)} />
      </ConfirmProvider>,
    );
    const first = confirm?.({ title: 'First?' });
    const second = confirm?.({ title: 'Second?' });
    await expect(first).resolves.toBe(false);
    expect(await screen.findByRole('alertdialog', { name: 'Second?' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }));
    await expect(second).resolves.toBe(true);
  });

  it('should resolve a pending question as false when the provider unmounts', async () => {
    let confirm: ConfirmFn | undefined;
    const { unmount } = render(
      <ConfirmProvider>
        <Asker options={{ title: 'Leave?' }} onConfirm={fn => (confirm = fn)} />
      </ConfirmProvider>,
    );
    const pending = confirm?.({ title: 'Leave?' });
    unmount();
    await expect(pending).resolves.toBe(false);
  });

  it('should start each typed confirmation empty', async () => {
    const { user } = renderAsker({ title: 'Delete workspace?', confirmLabel: 'Delete', typedConfirmation: 'acme' });
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.type(screen.getByRole('textbox'), 'ac');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('should refuse to hand out confirm outside a provider', () => {
    const reactError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Asker options={{ title: 'Orphan?' }} />)).toThrow('useConfirm must be used within a ConfirmProvider');
    reactError.mockRestore();
  });
});
