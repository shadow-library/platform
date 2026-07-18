/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { TimePicker } from './TimePicker';

/**
 * Declaring the constants
 */

describe('TimePicker', () => {
  it('renders the committed value formatted for 12-hour display', () => {
    render(<TimePicker value="21:30" hour12 aria-label="Doors" />);
    expect(screen.getByRole('combobox', { name: 'Doors' })).toHaveValue('9:30 PM');
  });

  it('parses loose typed input on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker onValueChange={onValueChange} aria-label="Time" />);
    const field = screen.getByRole('combobox');
    await user.type(field, '9.30pm');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('21:30');
  });

  it('parses compact digit input (930 → 09:30)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker hour12={false} onValueChange={onValueChange} aria-label="Time" />);
    await user.type(screen.getByRole('combobox'), '930');
    await user.tab();
    expect(onValueChange).toHaveBeenLastCalledWith('09:30');
  });

  it('reverts unparseable input, unchanged', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker value="08:00" onValueChange={onValueChange} aria-label="Time" />);
    const field = screen.getByRole('combobox');
    await user.clear(field);
    await user.type(field, 'zzz');
    await user.tab();
    expect(field).toHaveValue('8:00 AM');
  });

  it('opens the suggestion list and selects a time', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TimePicker hour12={false} step={60} onValueChange={onValueChange} aria-label="Time" />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    expect(onValueChange).toHaveBeenCalledWith('09:00');
  });
});
