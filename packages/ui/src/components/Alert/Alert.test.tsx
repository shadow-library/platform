/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Alert } from './Alert';

/**
 * Declaring the constants
 */

describe('Alert', () => {
  it('renders the title and body with the intent set', () => {
    render(
      <Alert intent="warning" title="Approaching plan limit">
        You have used 91% of included build minutes.
      </Alert>,
    );
    expect(screen.getByText('Approaching plan limit')).toBeInTheDocument();
    expect(screen.getByText(/91%/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveAttribute('data-intent', 'warning');
  });

  it('uses role=alert for danger/warning and role=status for info/success', () => {
    const { rerender } = render(<Alert intent="danger" title="Payment failed" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<Alert intent="success" title="Migration complete" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders and fires the action', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Alert intent="danger" title="Payment failed" action={{ label: 'Update card', onClick }} />);
    await user.click(screen.getByRole('button', { name: 'Update card' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a dismiss button only when onDismiss is provided', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert intent="info" title="Scheduled maintenance" />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    rerender(<Alert intent="info" title="Scheduled maintenance" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
