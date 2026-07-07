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
import { Switch } from './Switch';

/**
 * Declaring the constants
 */

describe('Switch', () => {
  it('exposes a switch role named by its label', () => {
    render(<Switch label='Two-factor authentication' />);
    expect(screen.getByRole('switch', { name: 'Two-factor authentication' })).toBeInTheDocument();
  });

  it('toggles from the control and from the label', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch label='Notifications' onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByText('Notifications'));
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('toggles with the keyboard', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch label='Notifications' onCheckedChange={onCheckedChange} />);
    screen.getByRole('switch').focus();
    await user.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('supports a controlled checked value', () => {
    const { rerender } = render(<Switch label='SSO' checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch label='SSO' checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch label='SSO' disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('marks the pending async state', () => {
    render(<Switch label='SSO' pending checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-pending', 'true');
  });

  it('links a description via aria-describedby', () => {
    render(<Switch label='SSO' description='Require your identity provider' />);
    const control = screen.getByRole('switch');
    const description = screen.getByText('Require your identity provider');
    expect(control.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('renders a standalone switch using aria-label', () => {
    render(<Switch aria-label='Maintenance mode' />);
    expect(screen.getByRole('switch', { name: 'Maintenance mode' })).toBeInTheDocument();
  });

  it('forwards the ref to the control', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Switch ref={ref} label='SSO' />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
