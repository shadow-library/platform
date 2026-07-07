/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Rating } from './Rating';

/**
 * Declaring the constants
 */

describe('Rating', () => {
  it('renders an input radio group with per-star radios', () => {
    render(<Rating value={3} aria-label='Quality' />);
    expect(screen.getByRole('radiogroup', { name: 'Quality' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '1 star' })).toHaveAttribute('aria-checked', 'false');
  });

  it('commits a rating on click', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Rating value={0} onValueChange={onValueChange} aria-label='Quality' />);
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onValueChange).toHaveBeenCalledWith(4);
  });

  it('clears when the current value is clicked again', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Rating value={3} onValueChange={onValueChange} aria-label='Quality' />);
    await user.click(screen.getByRole('radio', { name: '3 stars' }));
    expect(onValueChange).toHaveBeenCalledWith(0);
  });

  it('moves the value with arrow keys', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Rating value={2} onValueChange={onValueChange} aria-label='Quality' />);
    screen.getByRole('radio', { name: '2 stars' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith(3);
  });

  it('renders read-only mode as a single image with an accessible name', () => {
    render(<Rating value={4.3} readOnly reviewCount={128} />);
    expect(screen.getByRole('img', { name: 'Rated 4.3 out of 5, 128 reviews' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
