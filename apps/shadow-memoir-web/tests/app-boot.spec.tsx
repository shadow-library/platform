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
  it('should render the signed-out landing screen', async () => {
    renderAt('/welcome');
    expect(await screen.findByText('Shadow Memoir', undefined, { timeout: 10_000 })).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDefined();
  });

  it('should render the not-found screen for an unknown path', async () => {
    renderAt('/no-such-screen');
    expect(await screen.findByText('Page not found', undefined, { timeout: 10_000 })).toBeDefined();
  });
});
