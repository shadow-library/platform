/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { ColorPicker } from './ColorPicker';

/**
 * Declaring the constants
 */

describe('ColorPicker', () => {
  it('renders a trigger showing the committed value', () => {
    render(<ColorPicker value='#4f46e5' aria-label='Brand color' />);
    expect(screen.getByRole('button', { name: /Brand color: #4f46e5/i })).toBeInTheDocument();
  });

  it('opens a labelled palette radiogroup and commits a swatch', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<ColorPicker value='#4f46e5' onCommit={onCommit} aria-label='Color' />);
    await user.click(screen.getByRole('button', { name: /Color:/i }));
    expect(screen.getByRole('radiogroup', { name: 'Palette' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Indigo' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    expect(onCommit).toHaveBeenCalledWith('#16a34a');
  });

  it('accepts valid hex input live', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ColorPicker value='#4f46e5' onValueChange={onValueChange} aria-label='Color' />);
    await user.click(screen.getByRole('button', { name: /Color:/i }));
    const hex = screen.getByRole('textbox', { name: 'Hex color' });
    await user.clear(hex);
    await user.type(hex, '#00ff00');
    expect(onValueChange).toHaveBeenLastCalledWith('#00ff00');
  });

  it('marks invalid hex without committing', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value='#4f46e5' aria-label='Color' />);
    await user.click(screen.getByRole('button', { name: /Color:/i }));
    const hex = screen.getByRole('textbox', { name: 'Hex color' });
    await user.clear(hex);
    await user.type(hex, 'zzz');
    expect(hex).toHaveAttribute('data-invalid');
  });
});
