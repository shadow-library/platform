/**
 * Importing npm packages
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { NumberStepper } from './NumberStepper';
import { type NumberStepperProps } from './NumberStepper.types';

/**
 * Declaring the constants
 */
function FallbackStepper({ fallback, onValueChange, ...props }: NumberStepperProps & { fallback: number }): ReactElement {
  const [value, setValue] = useState<number | null>(null);
  return (
    <NumberStepper
      {...props}
      value={value ?? fallback}
      onValueChange={next => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

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

  it('should clamp a typed value on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper defaultValue={2} min={1} max={30} onValueChange={onValueChange} aria-label="Every N days" />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.type(field, '99');
    await user.tab();
    expect(field).toHaveValue('30');
    expect(onValueChange).toHaveBeenLastCalledWith(30);

    await user.clear(field);
    await user.type(field, '0');
    await user.tab();
    expect(field).toHaveValue('1');
    expect(onValueChange).toHaveBeenLastCalledWith(1);
  });

  it('should keep an out-of-range typed value on blur when clampOnBlur is false', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper defaultValue={2} min={1} max={30} clampOnBlur={false} onValueChange={onValueChange} aria-label="Every N days" />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.type(field, '99');
    await user.tab();
    expect(field).toHaveValue('99');
    expect(onValueChange).toHaveBeenLastCalledWith(99);
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  });

  it('should round a typed value to the precision on blur', async () => {
    const user = userEvent.setup();
    render(<NumberStepper defaultValue={70} min={30} max={250} precision={1} aria-label="Weight" />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.type(field, '72.46');
    await user.tab();
    expect(field).toHaveValue('72.5');
  });

  it('should restore the value when blurred on a partial number', async () => {
    const user = userEvent.setup();
    render(<NumberStepper defaultValue={null} aria-label="Count" />);
    const field = screen.getByRole('spinbutton');

    await user.type(field, '-');
    await user.tab();
    expect(field).toHaveValue('');
  });

  it('should keep typed text while a controlled parent substitutes a fallback for an empty value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<FallbackStepper fallback={1} min={1} max={30} precision={0} onValueChange={onValueChange} aria-label="Every N days" />);
    const field = screen.getByRole('spinbutton');

    await user.click(field);
    await user.keyboard('{End}{Backspace}5');
    expect(field).toHaveValue('5');
    expect(onValueChange).toHaveBeenLastCalledWith(5);
  });

  it('should keep typed decimal text while a controlled parent substitutes a fallback for an empty value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<FallbackStepper fallback={72.4} min={30} max={250} step={0.1} precision={1} onValueChange={onValueChange} aria-label="Weight" />);
    const field = screen.getByRole('spinbutton');

    await user.clear(field);
    await user.type(field, '75');
    expect(field).toHaveValue('75');
    expect(onValueChange).toHaveBeenLastCalledWith(75);
    await user.tab();
    expect(field).toHaveValue('75.0');
  });

  it('should show a controlled update that arrives while focused without edits', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { rerender } = render(<NumberStepper value={70} precision={1} onValueChange={onValueChange} aria-label="Weight" />);
    const field = screen.getByRole('spinbutton');

    await user.click(field);
    rerender(<NumberStepper value={72.4} precision={1} onValueChange={onValueChange} aria-label="Weight" />);
    expect(field).toHaveValue('72.4');
    await user.tab();
    expect(field).toHaveValue('72.4');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('should step decimals without floating-point residue', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper defaultValue={0.1} step={0.2} onValueChange={onValueChange} aria-label="Ratio" />);

    await user.click(screen.getByRole('spinbutton'));
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('spinbutton')).toHaveValue('0.3');
    expect(onValueChange).toHaveBeenLastCalledWith(0.3);
  });

  it('should step with arrow keys', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper defaultValue={4} min={1} max={5} onValueChange={onValueChange} aria-label="Every N days" />);
    const field = screen.getByRole('spinbutton');

    await user.click(field);
    await user.keyboard('{ArrowUp}');
    expect(field).toHaveValue('5');
    await user.keyboard('{ArrowUp}');
    expect(field).toHaveValue('5');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(field).toHaveValue('3');
    expect(onValueChange.mock.calls).toEqual([[5], [4], [3]]);
  });

  it('should ignore arrow keys when read-only', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberStepper value={4} readOnly onValueChange={onValueChange} aria-label="Count" />);

    await user.click(screen.getByRole('spinbutton'));
    await user.keyboard('{ArrowUp}');
    await user.tab();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('should keep stepping from the latest value while a step button is held', () => {
    vi.useFakeTimers();
    try {
      const onValueChange = vi.fn();
      render(<FallbackStepper fallback={70} min={30} max={250} step={0.1} precision={1} itemLabel="weight" onValueChange={onValueChange} aria-label="Weight" />);
      const increase = screen.getByRole('button', { name: 'Increase weight' });

      fireEvent.pointerDown(increase);
      act(() => vi.advanceTimersByTime(400));
      for (let tick = 0; tick < 3; tick += 1) act(() => vi.advanceTimersByTime(100));
      fireEvent.pointerUp(increase);
      act(() => vi.advanceTimersByTime(500));

      expect(screen.getByRole('spinbutton')).toHaveValue('70.4');
      expect(onValueChange.mock.calls).toEqual([[70.1], [70.2], [70.3], [70.4]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop repeating at the bound', () => {
    vi.useFakeTimers();
    try {
      const onValueChange = vi.fn();
      render(<NumberStepper defaultValue={3} max={4} itemLabel="replicas" onValueChange={onValueChange} aria-label="Replicas" />);

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Increase replicas' }));
      act(() => vi.advanceTimersByTime(400));
      for (let tick = 0; tick < 5; tick += 1) act(() => vi.advanceTimersByTime(100));

      expect(screen.getByRole('spinbutton')).toHaveValue('4');
      expect(onValueChange.mock.calls).toEqual([[4]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop repeating when the field becomes disabled mid-hold', () => {
    vi.useFakeTimers();
    try {
      const onValueChange = vi.fn();
      const { rerender } = render(<NumberStepper defaultValue={1} itemLabel="replicas" onValueChange={onValueChange} aria-label="Replicas" />);

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Increase replicas' }));
      act(() => vi.advanceTimersByTime(400));
      rerender(<NumberStepper defaultValue={1} disabled itemLabel="replicas" onValueChange={onValueChange} aria-label="Replicas" />);
      for (let tick = 0; tick < 3; tick += 1) act(() => vi.advanceTimersByTime(100));
      rerender(<NumberStepper defaultValue={1} itemLabel="replicas" onValueChange={onValueChange} aria-label="Replicas" />);
      for (let tick = 0; tick < 3; tick += 1) act(() => vi.advanceTimersByTime(100));

      expect(onValueChange.mock.calls).toEqual([[2]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should land on startValue when stepping an empty field', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <NumberStepper defaultValue={null} min={30} max={250} step={0.1} precision={1} startValue={78.4} itemLabel="weight" onValueChange={onValueChange} aria-label="Weight" />,
    );

    await user.click(screen.getByRole('button', { name: 'Increase weight' }));
    expect(screen.getByRole('spinbutton')).toHaveValue('78.4');
    await user.click(screen.getByRole('button', { name: 'Increase weight' }));
    expect(onValueChange.mock.calls).toEqual([[78.4], [78.5]]);
  });

  it('should forward aria-describedby to the field', () => {
    render(<NumberStepper value={3} aria-label="Replicas" aria-describedby="replicas-error" />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-describedby', 'replicas-error');
  });

  it('keeps step buttons out of the tab order', () => {
    render(<NumberStepper value={3} itemLabel="replicas" aria-label="Replicas" />);
    expect(screen.getByRole('button', { name: 'Increase replicas' })).toHaveAttribute('tabindex', '-1');
  });
});
