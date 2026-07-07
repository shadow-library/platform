/**
 * Importing npm packages
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Defining types
 */
export interface DeferredLoadingOptions {
  /** Don't show loading UI until the wait exceeds this (ms) — instant responses never flash. @default 150 */
  grace?: number;
  /** Once shown, keep loading UI at least this long (ms) — no single-frame flickers. @default 300 */
  minimum?: number;
}

/**
 * The 150ms-grace / 300ms-minimum timing rules from the loading family, in one hook so products can't
 * get them wrong. Returns whether the loading UI should be visible for a given `loading` flag: it
 * stays hidden until the wait crosses the grace window, then remains visible for at least the minimum
 * even if the work finishes sooner.
 */
export function useDeferredLoading(loading: boolean, options: DeferredLoadingOptions = {}): boolean {
  const { grace = 150, minimum = 300 } = options;
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (loading) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, grace);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, minimum - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [loading, visible, grace, minimum]);

  return visible;
}
