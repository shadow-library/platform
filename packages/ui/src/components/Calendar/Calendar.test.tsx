/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Calendar } from './Calendar';

/**
 * Declaring the constants
 */

describe('Calendar', () => {
  it('renders a date grid for the selected month', () => {
    render(<Calendar value='2026-06-15' aria-label='Deploy date' />);
    expect(screen.getByRole('grid', { name: /June 2026/ })).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('selects a day in single mode', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar value='2026-06-15' onValueChange={onValueChange} aria-label='Date' />);
    const cell = document.querySelector<HTMLButtonElement>('[aria-label*="June 20, 2026"], [aria-label*="20 June 2026"]');
    if (cell) await user.click(cell);
    expect(onValueChange).toHaveBeenCalledWith('2026-06-20');
  });

  it('builds a range across two clicks, swapping backwards picks', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar mode='range' defaultValue={{ start: null, end: null }} onValueChange={onValueChange} value={{ start: '2026-06-10', end: null }} aria-label='Range' />);
    const earlier = document.querySelector<HTMLButtonElement>('[aria-label*="June 5, 2026"], [aria-label*="5 June 2026"]');
    if (earlier) await user.click(earlier);
    expect(onValueChange).toHaveBeenCalledWith({ start: '2026-06-05', end: '2026-06-10' });
  });

  it('navigates and selects with the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar value='2026-06-15' onValueChange={onValueChange} aria-label='Date' />);
    const focused = document.querySelector<HTMLButtonElement>('[tabindex="0"]');
    focused?.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-06-16');
  });

  it('disables dates before min', () => {
    render(<Calendar value='2026-06-15' min='2026-06-10' aria-label='Date' />);
    const before = document.querySelector<HTMLButtonElement>('[aria-label*="June 5, 2026"], [aria-label*="5 June 2026"]');
    expect(before).toBeDisabled();
  });
});
