import { TooltipProvider } from '@shadow-library/ui';
import { userInfoQueryKey } from '@shadow-library/web';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/features/shell';
import shellStyles from '@/features/shell/app-shell.module.css';
import { MemoirDataProvider } from '@/lib/data';

import { createMemoirTestData } from './harness';

/**
 * Every path `DESKTOP_NAV`/`PHONE_NAV` link to, so the sidebar and bottom nav resolve real routes.
 */
const PATHS = ['/', '/plan', '/log', '/log/meals', '/log/health', '/log/sidequests', '/finance', '/history', '/insights', '/review', '/ai', '/hero', '/settings'];

function stubPhoneViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function stubDesktopViewport(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function renderAppShell(): ReturnType<typeof render> {
  const data = createMemoirTestData();
  data.queryClient.setQueryData(userInfoQueryKey, { sub: 'usr_1', name: 'Ada Lovelace' });

  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={data.queryClient}>
        <MemoirDataProvider value={data}>
          <TooltipProvider>
            <AppShell>
              <div>Today</div>
            </AppShell>
          </TooltipProvider>
        </MemoirDataProvider>
      </QueryClientProvider>
    ),
  });
  const routes = PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => null }));
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: ['/'] }) });

  return render(<RouterProvider router={router as never} />);
}

describe('AppShell quick-capture FAB', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('should render the quick-capture FAB with fixed placement on phone', async () => {
    stubPhoneViewport();
    renderAppShell();

    // The palette trigger shares the "Quick capture" name (UI-009's audit note), so the FAB is the one
    // carrying `data-placement` — `placement="static"` used to lose the specificity fight against the
    // app's own `.fab { position: fixed }` and render in flow at the bottom of the page.
    const named = await screen.findAllByRole('button', { name: 'Quick capture' });
    const fab = named.find(button => button.hasAttribute('data-placement'));
    expect(fab).toBeDefined();
    expect(fab?.getAttribute('data-placement')).toBe('fixed');
  });

  it('should reserve extra bottom clearance for the FAB on phone', async () => {
    stubPhoneViewport();
    const { container } = renderAppShell();

    // Waits for the shell (and its FAB) to finish mounting before inspecting the Shell root's class list.
    await screen.findAllByRole('button', { name: 'Quick capture' });

    const shellRoot = container.querySelector('[data-bottom-nav]');
    expect(shellRoot).not.toBeNull();
    expect(shellStyles.fabClearance).toBeTruthy();
    expect(shellRoot?.classList.contains(shellStyles.fabClearance ?? '')).toBe(true);
  });

  it('should not reserve FAB clearance on desktop, where no FAB renders', async () => {
    stubDesktopViewport();
    renderAppShell();

    const main = await screen.findByRole('main');
    expect(screen.queryAllByRole('button', { name: 'Quick capture' })).toHaveLength(1); // the palette trigger only, no FAB
    const shellRoot = main.parentElement?.parentElement;
    expect(shellRoot?.classList.contains(shellStyles.fabClearance ?? '')).toBe(false);
  });
});
