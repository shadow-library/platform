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
import { OtpInput } from './OtpInput';

/**
 * Declaring the constants
 */
const boxes = () => screen.getAllByRole<HTMLInputElement>('textbox');
const box = (index: number): HTMLInputElement => {
  const el = boxes()[index];
  if (!el) throw new Error(`No box at index ${index}`);
  return el;
};

describe('OtpInput', () => {
  it('renders one box per character with an accessible name per box', () => {
    render(<OtpInput length={4} aria-label='Code' />);
    expect(boxes()).toHaveLength(4);
    expect(screen.getByRole('textbox', { name: 'Code, character 1 of 4' })).toBeInTheDocument();
  });

  it('fills boxes, advances focus, and fires onComplete when full', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput length={4} onComplete={onComplete} />);
    await user.click(box(0));
    await user.keyboard('1234');
    expect(box(0).value).toBe('1');
    expect(box(3).value).toBe('4');
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('rejects characters outside the allowed set', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} type='numeric' />);
    await user.click(box(0));
    await user.keyboard('a1');
    expect(box(0).value).toBe('1');
  });

  it('distributes a pasted value across boxes, stripping disallowed characters', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<OtpInput length={6} onValueChange={onValueChange} />);
    await user.click(box(0));
    await user.paste('12-34-56');
    expect(onValueChange).toHaveBeenLastCalledWith('123456');
    expect(box(5).value).toBe('6');
  });

  it('honours a custom allowedPattern', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} allowedPattern={/[a-f]/} />);
    await user.click(box(0));
    await user.paste('1a2b3c');
    expect(
      boxes()
        .map(el => el.value)
        .join(''),
    ).toBe('abc');
  });

  it('moves back and clears on Backspace from an empty box', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} defaultValue='12' />);
    await user.click(box(2));
    await user.keyboard('{Backspace}');
    expect(box(1).value).toBe('');
    expect(box(1)).toHaveFocus();
  });

  it('supports a controlled value', () => {
    const { rerender } = render(<OtpInput length={4} value='99' onValueChange={() => {}} />);
    expect(box(0).value).toBe('9');
    expect(box(2).value).toBe('');
    rerender(<OtpInput length={4} value='999' onValueChange={() => {}} />);
    expect(box(2).value).toBe('9');
  });

  it('disables every box', () => {
    render(<OtpInput length={4} disabled />);
    for (const el of boxes()) expect(el).toBeDisabled();
  });

  it('forwards the ref to the first box', () => {
    const ref = createRef<HTMLInputElement>();
    render(<OtpInput length={4} ref={ref} aria-label='Code' />);
    expect(ref.current).toBe(box(0));
  });
});
