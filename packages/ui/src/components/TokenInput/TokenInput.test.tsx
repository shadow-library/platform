/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { TokenInput } from './TokenInput';

/**
 * Declaring the constants
 */

describe('TokenInput', () => {
  it('adds a token on Enter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TokenInput onValueChange={onValueChange} aria-label="Recipients" />);
    await user.type(screen.getByLabelText('Recipients'), 'ana@acme.com{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith([{ value: 'ana@acme.com', valid: true }]);
    expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
  });

  it('splits a typed separator into tokens', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TokenInput onValueChange={onValueChange} aria-label="Recipients" />);
    await user.type(screen.getByLabelText('Recipients'), 'a@x.com,b@x.com,');
    expect(onValueChange).toHaveBeenLastCalledWith([
      { value: 'a@x.com', valid: true },
      { value: 'b@x.com', valid: true },
    ]);
  });

  it('marks invalid tokens via the validator', async () => {
    const user = userEvent.setup();
    render(<TokenInput validate={value => value.includes('@')} aria-label="Emails" />);
    await user.type(screen.getByLabelText('Emails'), 'not-an-email{Enter}');
    expect(screen.getByText('not-an-email')).toHaveAttribute('data-invalid');
    expect(screen.getByLabelText('Emails')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not add a duplicate', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TokenInput value={[{ value: 'a@x.com', valid: true }]} onValueChange={onValueChange} aria-label="Emails" />);
    await user.type(screen.getByLabelText('Emails'), 'a@x.com{Enter}');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('removes the last token with Backspace on an empty draft', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <TokenInput
        value={[
          { value: 'a@x.com', valid: true },
          { value: 'b@x.com', valid: true },
        ]}
        onValueChange={onValueChange}
        aria-label="Emails"
      />,
    );
    const field = screen.getByLabelText('Emails');
    field.focus();
    await user.keyboard('{Backspace}{Backspace}');
    expect(onValueChange).toHaveBeenLastCalledWith([{ value: 'a@x.com', valid: true }]);
  });

  it('removes a token via its labelled button', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TokenInput value={[{ value: 'ana@acme.com', valid: true }]} onValueChange={onValueChange} aria-label="Emails" />);
    await user.click(screen.getByRole('button', { name: 'Remove ana@acme.com' }));
    expect(onValueChange).toHaveBeenLastCalledWith([]);
  });

  it('splits a pasted list', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<TokenInput onValueChange={onValueChange} aria-label="Emails" />);
    const field = screen.getByLabelText('Emails');
    field.focus();
    await user.paste('a@x.com, b@x.com c@x.com');
    expect(onValueChange).toHaveBeenLastCalledWith([
      { value: 'a@x.com', valid: true },
      { value: 'b@x.com', valid: true },
      { value: 'c@x.com', valid: true },
    ]);
  });
});
