/**
 * Importing npm packages
 */
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { useHydrated } from './useHydrated';

/**
 * Declaring the constants
 */

describe('useHydrated', () => {
  it('reports true once rendered in the browser', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });

  it('reports false on the server', () => {
    function Probe() {
      return createElement('span', null, useHydrated() ? 'hydrated' : 'server');
    }
    expect(renderToStaticMarkup(createElement(Probe))).toContain('server');
  });
});
