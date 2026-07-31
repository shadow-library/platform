/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { EmptyState } from './EmptyState';

/**
 * Declaring the constants
 */

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No services yet" description="Services deploy from a connected repository." />);
    expect(screen.getByText('No services yet')).toBeInTheDocument();
    expect(screen.getByText(/connected repository/)).toBeInTheDocument();
  });

  it('runs the primary and secondary actions', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(<EmptyState title="No API keys" action={{ label: 'Create key', onClick: onPrimary }} secondaryAction={{ label: 'Learn more', onClick: onSecondary }} />);
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Learn more' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders the illustration decoratively only at page size', () => {
    const { rerender } = render(<EmptyState title="Empty" illustration={<svg data-testid="art" />} />);
    expect(screen.getByTestId('art')).toBeInTheDocument();
    rerender(<EmptyState title="Empty" size="inline" illustration={<svg data-testid="art" />} />);
    expect(screen.queryByTestId('art')).not.toBeInTheDocument();
  });
});
