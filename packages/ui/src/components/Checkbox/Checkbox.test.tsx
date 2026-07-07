/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Checkbox } from './Checkbox';

/**
 * Declaring the constants
 */

describe('Checkbox', () => {
  it('associates the label as the accessible name', () => {
    render(<Checkbox label='Send weekly summary' />);
    expect(screen.getByRole('checkbox', { name: 'Send weekly summary' })).toBeInTheDocument();
  });

  it('toggles from the box and from the label', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox label='Emails' onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByText('Emails'));
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('supports a controlled checked value', () => {
    const { rerender } = render(<Checkbox label='Emails' checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    rerender(<Checkbox label='Emails' checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('exposes the indeterminate state as aria-checked="mixed"', () => {
    render(<Checkbox label='All' checked='indeterminate' onCheckedChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed');
  });

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox label='Emails' disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('reflects the invalid state', () => {
    render(<Checkbox label='Consent' invalid />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(checkbox).toHaveAttribute('data-invalid', 'true');
  });

  it('links a description via aria-describedby', () => {
    render(<Checkbox label='Digest' description='Every Monday at 9:00' />);
    const checkbox = screen.getByRole('checkbox');
    const description = screen.getByText('Every Monday at 9:00');
    expect(checkbox.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('renders a standalone box using aria-label', () => {
    render(<Checkbox aria-label='Select row' />);
    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeInTheDocument();
  });

  it('forwards the ref to the control', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Checkbox ref={ref} label='Emails' />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
