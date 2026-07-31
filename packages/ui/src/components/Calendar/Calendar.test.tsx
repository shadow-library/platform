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
    render(<Calendar value="2026-06-15" aria-label="Deploy date" />);
    expect(screen.getByRole('grid', { name: /June 2026/ })).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('selects a day in single mode', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar value="2026-06-15" onValueChange={onValueChange} aria-label="Date" />);
    const cell = document.querySelector<HTMLButtonElement>('[aria-label*="June 20, 2026"], [aria-label*="20 June 2026"]');
    if (cell) await user.click(cell);
    expect(onValueChange).toHaveBeenCalledWith('2026-06-20');
  });

  it('builds a range across two clicks, swapping backwards picks', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar mode="range" defaultValue={{ start: null, end: null }} onValueChange={onValueChange} value={{ start: '2026-06-10', end: null }} aria-label="Range" />);
    const earlier = document.querySelector<HTMLButtonElement>('[aria-label*="June 5, 2026"], [aria-label*="5 June 2026"]');
    if (earlier) await user.click(earlier);
    expect(onValueChange).toHaveBeenCalledWith({ start: '2026-06-05', end: '2026-06-10' });
  });

  it('bands the range endpoints so their pills touch the in-range strip', () => {
    render(<Calendar mode="range" value={{ start: '2026-06-10', end: '2026-06-14' }} aria-label="Range" />);
    const startCell = document.querySelector<HTMLButtonElement>('[aria-label*="June 10, 2026"], [aria-label*="10 June 2026"]')?.closest('td');
    const endCell = document.querySelector<HTMLButtonElement>('[aria-label*="June 14, 2026"], [aria-label*="14 June 2026"]')?.closest('td');
    const middleCell = document.querySelector<HTMLButtonElement>('[aria-label*="June 12, 2026"], [aria-label*="12 June 2026"]')?.closest('td');
    expect(startCell).toHaveAttribute('data-range-edge', 'start');
    expect(endCell).toHaveAttribute('data-range-edge', 'end');
    expect(middleCell).toHaveAttribute('data-in-range');
  });

  it('navigates and selects with the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Calendar value="2026-06-15" onValueChange={onValueChange} aria-label="Date" />);
    const focused = document.querySelector<HTMLButtonElement>('[tabindex="0"]');
    focused?.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('2026-06-16');
  });

  it('hides adjacent-month days in a multi-month view so a date never repeats', () => {
    render(<Calendar value="2026-06-15" months={2} aria-label="Range" />);
    // July 1 is a trailing outside day of June and a real day of July — it must render exactly once.
    const julyFirst = document.querySelectorAll('[aria-label*="July 1, 2026"], [aria-label*=", 1 July 2026"]');
    expect(julyFirst).toHaveLength(1);
  });

  it('still shows outside days in a single-month view', () => {
    render(<Calendar value="2026-06-15" months={1} aria-label="Date" />);
    const julyFirst = document.querySelectorAll('[aria-label*="July 1, 2026"], [aria-label*=", 1 July 2026"]');
    expect(julyFirst.length).toBeGreaterThanOrEqual(1);
  });

  it('disables dates before min', () => {
    render(<Calendar value="2026-06-15" min="2026-06-10" aria-label="Date" />);
    const before = document.querySelector<HTMLButtonElement>('[aria-label*="June 5, 2026"], [aria-label*="5 June 2026"]');
    expect(before).toBeDisabled();
  });
});
