/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Input } from './Input';

/**
 * Declaring the constants
 */
const Icon = () => <svg data-testid="icon" viewBox="0 0 16 16" aria-hidden="true" />;

describe('Input', () => {
  it('renders a native text field reachable by its accessible name', () => {
    render(<Input aria-label="Workspace" placeholder="Acme" />);
    const input = screen.getByRole('textbox', { name: 'Workspace' });
    expect(input).toHaveAttribute('placeholder', 'Acme');
  });

  it('reflects size and invalid on the wrapper and sets aria-invalid', () => {
    render(<Input aria-label="Field" size="lg" invalid />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.parentElement).toHaveAttribute('data-size', 'lg');
    expect(input.parentElement).toHaveAttribute('data-invalid', 'true');
  });

  it('fires onValueChange with the string value while typing', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Input aria-label="Field" onValueChange={onValueChange} />);
    await user.type(screen.getByRole('textbox'), 'hi');
    expect(onValueChange).toHaveBeenLastCalledWith('hi');
  });

  it('supports a controlled value', async () => {
    function Controlled() {
      const [value, setValue] = useState('a');
      return <Input aria-label="Field" value={value} onValueChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('a');
    await user.type(input, 'b');
    expect(input.value).toBe('ab');
  });

  it('starts from defaultValue when uncontrolled', () => {
    render(<Input aria-label="Field" defaultValue="seed" />);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('seed');
  });

  it('clears the value through the clear button', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Input aria-label="Search" clearable defaultValue="query" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onValueChange).toHaveBeenLastCalledWith('');
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('');
  });

  it('hides the clear button when the field is empty', () => {
    render(<Input aria-label="Search" clearable />);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('renders a string prefix as a fused addon and a node prefix as an icon', () => {
    const { rerender } = render(<Input aria-label="URL" prefix="https://" />);
    expect(screen.getByText('https://')).toBeInTheDocument();
    rerender(<Input aria-label="Search" prefix={<Icon />} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('forwards disabled and readOnly to the input', () => {
    const { rerender } = render(<Input aria-label="Field" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    rerender(<Input aria-label="Field" readOnly value="locked" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
  });

  it('reveals and hides a password through the eye toggle', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Password" type="password" defaultValue="hunter2" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('omits the reveal toggle when revealable is false', () => {
    render(<Input aria-label="Password" type="password" revealable={false} />);
    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument();
  });

  it('shows no reveal toggle for non-password inputs', () => {
    render(<Input aria-label="Field" type="text" />);
    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument();
  });

  it('routes className to the wrapper and forwards the ref to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Field" className="w-full" />);
    const input = screen.getByRole('textbox');
    expect(ref.current).toBe(input);
    expect(input.parentElement).toHaveClass('w-full');
  });
});
