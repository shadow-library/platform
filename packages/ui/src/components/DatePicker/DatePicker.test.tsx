/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { DatePicker } from './DatePicker';

/**
 * Declaring the constants
 */

describe('DatePicker', () => {
  it('renders the ISO value in the field', () => {
    render(<DatePicker value="2026-06-30" onValueChange={() => {}} aria-label="Date" />);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-06-30');
  });

  it('opens the calendar and commits a clicked day', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker value="2026-06-30" onValueChange={onValueChange} aria-label="Date" />);
    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeInTheDocument();
    const june15 = document.querySelector('[data-date="2026-06-15"]');
    expect(june15).not.toBeNull();
    await user.click(june15 as HTMLElement);
    expect(onValueChange).toHaveBeenCalledWith('2026-06-15');
  });

  it('commits valid typed input on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker onValueChange={onValueChange} aria-label="Date" />);
    await user.type(screen.getByLabelText('Date'), '2026-03-14');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('2026-03-14');
  });

  it('marks invalid typed input on blur', async () => {
    const user = userEvent.setup();
    render(<DatePicker aria-label="Date" />);
    const field = screen.getByLabelText('Date');
    await user.type(field, 'not-a-date');
    await user.tab();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables dates before min', async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-06-30" min="2026-06-10" onValueChange={() => {}} aria-label="Date" />);
    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    expect(document.querySelector('[data-date="2026-06-05"]')).toBeDisabled();
  });

  it('clears the value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<DatePicker value="2026-06-30" clearable onValueChange={onValueChange} aria-label="Date" />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onValueChange).toHaveBeenCalledWith(null);
  });
});
