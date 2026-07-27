/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
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
