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
import { Textarea } from './Textarea';

/**
 * Declaring the constants
 */

describe('Textarea', () => {
  it('renders a native textarea reachable by its accessible name', () => {
    render(<Textarea aria-label='Description' placeholder='What does it do?' />);
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAttribute('placeholder', 'What does it do?');
  });

  it('starts at minRows and reflects size and invalid', () => {
    render(<Textarea aria-label='Notes' size='lg' minRows={5} invalid />);
    const field = screen.getByRole('textbox');
    expect(field).toHaveAttribute('rows', '5');
    expect(field).toHaveAttribute('data-size', 'lg');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('fires onValueChange with the string value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea aria-label='Notes' onValueChange={onValueChange} />);
    await user.type(screen.getByRole('textbox'), 'hi');
    expect(onValueChange).toHaveBeenLastCalledWith('hi');
  });

  it('supports controlled and uncontrolled values', async () => {
    const { rerender } = render(<Textarea aria-label='Notes' defaultValue='seed' />);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('seed');
    rerender(<Textarea aria-label='Notes' value='fixed' onValueChange={() => {}} />);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('fixed');
  });

  it('enables a vertical resize handle only when auto-grow is off', () => {
    const { rerender } = render(<Textarea aria-label='Notes' />);
    expect(screen.getByRole('textbox')).toHaveAttribute('data-autogrow', 'true');
    rerender(<Textarea aria-label='Notes' autoGrow={false} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('data-autogrow', 'false');
  });

  it('hides the counter until 80% of the limit, then flags the limit', () => {
    const { rerender } = render(<Textarea aria-label='Bio' showCount maxLength={10} value='1234' onValueChange={() => {}} />);
    const counter = screen.getByText('4 / 10');
    expect(counter).not.toHaveAttribute('data-visible');

    rerender(<Textarea aria-label='Bio' showCount maxLength={10} value='12345678' onValueChange={() => {}} />);
    expect(screen.getByText('8 / 10')).toHaveAttribute('data-visible', 'true');

    rerender(<Textarea aria-label='Bio' showCount maxLength={10} value='1234567890' onValueChange={() => {}} />);
    expect(screen.getByText('10 / 10')).toHaveAttribute('data-state', 'limit');
  });

  it('links the counter to the field via aria-describedby', () => {
    render(<Textarea aria-label='Bio' showCount maxLength={10} value='12345678' onValueChange={() => {}} />);
    const field = screen.getByRole('textbox');
    const counter = screen.getByText('8 / 10');
    expect(field.getAttribute('aria-describedby')).toContain(counter.id);
  });

  it('does not render a counter without maxLength', () => {
    render(<Textarea aria-label='Notes' showCount />);
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
  });

  it('routes className to the wrapper and forwards the ref to the textarea', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label='Notes' className='col-span-2' />);
    const field = screen.getByRole('textbox');
    expect(ref.current).toBe(field);
    expect(field.parentElement).toHaveClass('col-span-2');
  });
});
