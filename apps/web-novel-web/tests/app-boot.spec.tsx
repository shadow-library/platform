/**
 * Importing npm packages
 */
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { getRouter } from '@/router';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The boot smoke test: the real route tree, router, and query wiring render against jsdom. No API server
 * answers here, so the catalog queries stay empty and the assertions target each screen's static chrome —
 * this is the "app starts and screens draw" gate that runs in `shadow verify`.
 */
function renderAt(path: string) {
  const router = getRouter();
  router.update({ ...router.options, history: createMemoryHistory({ initialEntries: [path] }) });
  return render(<RouterProvider router={router} />);
}

describe('app boot', () => {
  it('should render the home dashboard sections', async () => {
    renderAt('/');
    expect(await screen.findByText('Trending now', undefined, { timeout: 10_000 })).toBeDefined();
    expect(await screen.findByText('Recently updated')).toBeDefined();
  });

  it('should render the sign-in entry screen', async () => {
    renderAt('/login');
    expect(await screen.findByText('Sign in to Shadow', undefined, { timeout: 10_000 })).toBeDefined();
    expect(await screen.findByText('Continue to sign in →')).toBeDefined();
  });

  it('should render the browse catalog screen', async () => {
    renderAt('/browse');
    expect(await screen.findByText('Browse novels', undefined, { timeout: 10_000 })).toBeDefined();
  });
});
