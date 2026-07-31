/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { AccessDenied } from './AccessDenied';

/**
 * Declaring the constants
 */

describe('AccessDenied', () => {
  it('names the application it refused so the user knows what to ask for', () => {
    render(<AccessDenied application="Pulse" />);
    expect(screen.getByText('You don’t have access to Pulse')).toBeInTheDocument();
    expect(screen.getByText(/hasn’t given you access to Pulse/)).toBeInTheDocument();
  });

  it('falls back to generic copy when the application is unknown', () => {
    render(<AccessDenied />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText(/don’t have permission to use this application/)).toBeInTheDocument();
  });

  /** The provider's own wording beats the derived copy — it knows why in a way this component cannot. */
  it('prefers an explicit title and description', () => {
    render(<AccessDenied application="Pulse" title="Not for you" description="Your trial ended." />);
    expect(screen.getByText('Not for you')).toBeInTheDocument();
    expect(screen.getByText('Your trial ended.')).toBeInTheDocument();
    expect(screen.queryByText('You don’t have access to Pulse')).not.toBeInTheDocument();
  });

  it('shows diagnostics only when there are any', () => {
    const { rerender } = render(<AccessDenied />);
    expect(screen.queryByText(/request_id/)).not.toBeInTheDocument();

    rerender(<AccessDenied error="APP_007" requestId="req-42" />);
    expect(screen.getByText('error: APP_007')).toBeInTheDocument();
    expect(screen.getByText('request_id: req-42')).toBeInTheDocument();
  });

  it('runs the actions and renders the footer slot', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    render(<AccessDenied action={{ label: 'Back to sign in', onClick: onPrimary }} footer={<a href="mailto:support@example.com">Contact support</a>} />);

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Contact support' })).toBeInTheDocument();
  });
});
