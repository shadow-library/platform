/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { DateRangePicker } from './DateRangePicker';

/**
 * Declaring the constants
 */
const presets = [
  { label: 'This week', range: { start: '2026-06-08', end: '2026-06-14' } },
  { label: 'Last 7 days', range: { start: '2026-06-01', end: '2026-06-07' } },
];

describe('DateRangePicker', () => {
  it('shows the formatted range on the trigger', () => {
    render(<DateRangePicker value={{ start: '2026-06-01', end: '2026-06-16' }} aria-label='Report period' />);
    expect(screen.getByRole('button', { name: /Report period/ })).toHaveTextContent(/Jun.*–.*Jun/);
  });

  it('opens the calendar dialog with a preset rail', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker presets={presets} aria-label='Period' />);
    await user.click(screen.getByRole('button', { name: /Period/ }));
    expect(screen.getByRole('dialog', { name: 'Choose date range' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'This week' })).toBeInTheDocument();
    expect(screen.getAllByRole('grid', { name: /Period/ }).length).toBeGreaterThan(0);
  });

  it('applies a preset immediately in default mode', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DateRangePicker presets={presets} onValueChange={onValueChange} aria-label='Period' />);
    await user.click(screen.getByRole('button', { name: /Period/ }));
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }));
    expect(onValueChange).toHaveBeenCalledWith({ start: '2026-06-01', end: '2026-06-07' });
  });

  it('defers commit until Apply in confirm mode', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DateRangePicker presets={presets} confirm onValueChange={onValueChange} aria-label='Period' />);
    await user.click(screen.getByRole('button', { name: /Period/ }));
    await user.click(screen.getByRole('option', { name: 'This week' }));
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onValueChange).toHaveBeenCalledWith({ start: '2026-06-08', end: '2026-06-14' });
  });
});
