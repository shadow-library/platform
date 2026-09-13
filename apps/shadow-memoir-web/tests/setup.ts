import { notifyManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

/**
 * Flush React Query notifications synchronously. Queries settle asynchronously, so one can resolve after a
 * test has torn jsdom down; the default batch scheduler would then run its callback with no `window`.
 */
notifyManager.setScheduler(run => run());

/** Test globals are imported explicitly here, so testing-library's auto-cleanup never self-registers. */
afterEach(cleanup);

const INITIAL_TZ = process.env.TZ;

/**
 * Assigning `undefined` to `process.env.TZ` coerces to the string `"undefined"`, an invalid zone that falls
 * back to UTC rather than restoring the unset state — so restoring deletes the key when it was unset.
 */
export async function withTimeZone<T>(zone: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

afterAll(() => {
  if (INITIAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = INITIAL_TZ;
});

/**
 * jsdom lacks the browser APIs the design system leans on (`matchMedia` for theming and breakpoints,
 * `ResizeObserver`/`IntersectionObserver` for overlays, `scrollTo`) — provide inert stand-ins so components
 * mount. IndexedDB stays absent on purpose: the offline layer must no-op without it.
 */
if (typeof window !== 'undefined') {
  window.matchMedia ??= (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;

  class ObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): never[] {
      return [];
    }
  }
  window.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
  window.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;
  window.scrollTo = () => undefined;

  /**
   * Node's own `localStorage` global is gated behind `--localstorage-file` and shadows jsdom's, so the
   * property is present but reads as `undefined` while `sessionStorage` stays intact. Restore a store so
   * per-viewer state behaves as it does in a browser instead of silently taking every no-storage branch.
   */
  if (!window.localStorage) {
    const entries = new Map<string, string>();
    const storage: Storage = {
      get length(): number {
        return entries.size;
      },
      key: index => [...entries.keys()][index] ?? null,
      getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => void entries.set(key, String(value)),
      removeItem: key => void entries.delete(key),
      clear: () => entries.clear(),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  }
}
