/**
 * Importing npm packages
 */
import { useEffect, useLayoutEffect } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * `useLayoutEffect` warns when it runs during SSR — the server can't run layout effects — so libraries
 * pick `useLayoutEffect` in the browser and `useEffect` on the server. Effects never run during server
 * render either way; this only silences the warning while keeping synchronous, pre-paint behavior on the
 * client. Selecting the hook once at module load (a bare `typeof window` check, no DOM access) is safe.
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
