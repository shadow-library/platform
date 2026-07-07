/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Slider } from './Slider';

/**
 * Declaring the constants
 */

describe('Slider', () => {
  it('renders a slider with the value display and unit', () => {
    render(<Slider value={40} min={0} max={100} unit='%' label='Threshold' aria-label='Threshold' />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('changes value with the keyboard and reports a number for a single slider', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Slider value={40} step={5} min={0} max={100} onValueChange={onValueChange} aria-label='Threshold' />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith(45);
  });

  it('renders two thumbs for a range and reports an array', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Slider value={[20, 80]} step={5} min={0} max={100} onValueChange={onValueChange} aria-label='Range' />);
    const thumbs = screen.getAllByRole('slider');
    expect(thumbs).toHaveLength(2);
    thumbs[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenLastCalledWith([25, 80]);
  });

  it('applies aria-valuetext with the formatted value', () => {
    render(<Slider value={2} min={0} max={8} formatValue={value => `${value} GB`} aria-label='Memory' />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '2 GB');
  });

  it('disables the control', () => {
    render(<Slider value={40} disabled aria-label='Threshold' />);
    expect(screen.getByRole('slider')).toHaveAttribute('data-disabled');
  });
});
