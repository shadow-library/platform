import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getRouter } from '@/router';

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
