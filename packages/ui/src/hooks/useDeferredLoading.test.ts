/**
 * Importing npm packages
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { useDeferredLoading } from './useDeferredLoading';

/**
 * Declaring the constants
 */
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useDeferredLoading', () => {
  it('stays hidden for waits shorter than the grace window', () => {
    const { result, rerender } = renderHook(({ loading }) => useDeferredLoading(loading, { grace: 150, minimum: 300 }), { initialProps: { loading: true } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false });
    expect(result.current).toBe(false);
  });

  it('shows after the grace window and holds for the minimum', () => {
    const { result, rerender } = renderHook(({ loading }) => useDeferredLoading(loading, { grace: 150, minimum: 300 }), { initialProps: { loading: true } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe(true);
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);
  });
});
