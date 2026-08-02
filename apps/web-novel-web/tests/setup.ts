/**
 * Importing npm packages
 */
import { notifyManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Flush React Query notifications synchronously. Queries settle asynchronously, so one can resolve after a
 * test has torn jsdom down; the default batch scheduler would then run its callback with no `window` and
 * crash the run. A synchronous scheduler notifies inline while the tree is still mounted.
 */
notifyManager.setScheduler(run => run());

/**
 * `@testing-library/react`'s auto-cleanup only self-registers when it finds a global `afterEach` (Jest's
 * default, or vitest with `test.globals: true`); this project imports test globals explicitly, so nothing
 * ever unmounted a previous test's render or router/QueryClient. Sequential `render()` calls in the same
 * spec file (e.g. `tests/app-boot.spec.tsx`) were therefore piling up trees in the same jsdom `document`,
 * and a still-subscribed query from an "unmounted" tree could settle mid-way through the next test — the
 * async teardown race. Explicit cleanup between every test closes that gap.
 */
afterEach(cleanup);

/**
 * jsdom lacks the browser APIs the design system leans on (`matchMedia` for theming/breakpoints,
 * `ResizeObserver`/`IntersectionObserver` for overlays, `scrollTo`) — provide inert stand-ins so
 * components mount. IndexedDB stays absent on purpose: the offline layer must no-op without it.
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
  // jsdom ships a throwing `scrollTo` — replace it outright so scroll restoration is a no-op.
  window.scrollTo = () => undefined;
}
