import { useCallback, useSyncExternalStore } from 'react';

/** Server snapshot is `false`, so gated UI renders its default branch until hydration; pair with a CSS media query when the pre-hydration frame must look right. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      const mediaQueryList = globalThis.matchMedia(query);
      mediaQueryList.addEventListener('change', onStoreChange);
      return () => mediaQueryList.removeEventListener('change', onStoreChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia(query).matches,
    () => false,
  );
}
