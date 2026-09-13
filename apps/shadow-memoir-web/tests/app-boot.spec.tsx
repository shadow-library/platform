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
  it('should render the sign-in redirect for the login route', async () => {
    renderAt('/login');
    expect(await screen.findByLabelText('Redirecting to sign-in', undefined, { timeout: 10_000 })).toBeDefined();
  });

  it('should render the not-found screen for an unknown path', async () => {
    renderAt('/no-such-screen');
    expect(await screen.findByText('Page not found', undefined, { timeout: 10_000 })).toBeDefined();
  });
});
