/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { NumberStepper } from './NumberStepper';

/**
 * Declaring the constants
 */

describe('NumberStepper', () => {
  it('renders a spinbutton with value and range', () => {
    render(<NumberStepper value={3} min={1} max={12} aria-label="Replicas" />);
    const field = screen.getByRole('spinbutton', { name: 'Replicas' });
    expect(field).toHaveAttribute('aria-valuenow', '3');
    expect(field).toHaveAttribute('aria-valuemin', '1');
    expect(field).toHaveAttribute('aria-valuemax', '12');
  });

  it('steps up and down through the labelled buttons', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper value={3} step={1} min={1} max={12} itemLabel="replicas" onValueChange={onValueChange} aria-label="Replicas" />);
    await user.click(screen.getByRole('button', { name: 'Increase replicas' }));
    expect(onValueChange).toHaveBeenLastCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Decrease replicas' }));
    expect(onValueChange).toHaveBeenLastCalledWith(2);
  });

  it('disables the step button at the bound', () => {
    render(<NumberStepper value={12} min={1} max={12} itemLabel="replicas" aria-label="Replicas" />);
    expect(screen.getByRole('button', { name: 'Increase replicas' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease replicas' })).toBeEnabled();
  });

  it('accepts numeric typing and rejects letters', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper onValueChange={onValueChange} aria-label="Count" />);
    const field = screen.getByRole('spinbutton');
    await user.type(field, '4a2');
    expect(field).toHaveValue('42');
    expect(onValueChange).toHaveBeenLastCalledWith(42);
  });

  it('exposes aria-valuetext with the unit', () => {
    render(<NumberStepper value={30} unit="sec" aria-label="Timeout" />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuetext', '30 sec');
  });

  it('keeps step buttons out of the tab order', () => {
    render(<NumberStepper value={3} itemLabel="replicas" aria-label="Replicas" />);
    expect(screen.getByRole('button', { name: 'Increase replicas' })).toHaveAttribute('tabindex', '-1');
  });
});
