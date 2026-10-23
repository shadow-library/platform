import { useEffect, useLayoutEffect } from 'react';

/** `useLayoutEffect` in the browser, `useEffect` on the server, where layout effects warn. */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
