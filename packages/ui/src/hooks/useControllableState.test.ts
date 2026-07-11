/**
 * Importing npm packages
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { useControllableState } from './useControllableState';

/**
 * Declaring the constants
 */

describe('useControllableState', () => {
  it('starts from the default value when uncontrolled', () => {
    const { result } = renderHook(() => useControllableState<number>({ value: undefined, defaultValue: 3 }));
    expect(result.current[0]).toBe(3);
  });

  it('supports a lazy default initializer, like useState', () => {
    const init = vi.fn(() => 7);
    const { rerender } = renderHook(() => useControllableState<number>({ value: undefined, defaultValue: init }));
    rerender();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('updates internal state and notifies onChange when uncontrolled', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useControllableState<number>({ value: undefined, defaultValue: 0, onChange }));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('reflects the controlled value and does not mutate internal state', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useControllableState<number>({ value, defaultValue: 0, onChange }), { initialProps: { value: 1 } });
    expect(result.current[0]).toBe(1);

    // Setting fires onChange but the resolved value stays owned by the prop.
    act(() => result.current[1](9));
    expect(onChange).toHaveBeenCalledWith(9);
    expect(result.current[0]).toBe(1);

    rerender({ value: 2 });
    expect(result.current[0]).toBe(2);
  });

  it('keeps a stable setter identity across renders', () => {
    const { result, rerender } = renderHook(() => useControllableState<number>({ value: undefined, defaultValue: 0 }));
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
