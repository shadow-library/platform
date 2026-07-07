/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { SegmentedControl } from './SegmentedControl';

/**
 * Declaring the constants
 */
function Example(props: { onValueChange?: (value: string) => void }) {
  return (
    <SegmentedControl defaultValue='1w' aria-label='Chart period' onValueChange={props.onValueChange}>
      <SegmentedControl.Item value='1d'>Day</SegmentedControl.Item>
      <SegmentedControl.Item value='1w'>Week</SegmentedControl.Item>
      <SegmentedControl.Item value='1m'>Month</SegmentedControl.Item>
    </SegmentedControl>
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radiogroup with the current segment checked', () => {
    render(<Example />);
    expect(screen.getByRole('radiogroup', { name: 'Chart period' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'false');
  });

  it('selects a segment on click and reports the value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);
    await user.click(screen.getByRole('radio', { name: 'Month' }));
    expect(onValueChange).toHaveBeenCalledWith('1m');
  });

  it('is one tab stop with roving focus', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveFocus();
  });
});
