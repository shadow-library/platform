import { useEffect, useRef, useState } from 'react';

export interface DeferredLoadingOptions {
  /** Don't show loading UI until the wait exceeds this (ms) — instant responses never flash. @default 150 */
  grace?: number;
  /** Once shown, keep loading UI at least this long (ms) — no single-frame flickers. @default 300 */
  minimum?: number;
}

/** Whether loading UI should show: hidden until `grace` elapses, then visible for at least `minimum` even if the work finishes sooner. */
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
