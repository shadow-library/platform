/**
 * Importing npm packages
 */

import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { AppShell } from './AppShell';
import { type AppShellProps } from './AppShell.types';

/**
 * Declaring the constants
 */
const PATHS = ['/', '/account', '/account/security', '/account/sessions', '/console', '/novels/$novelId/overview'];

/**
 * Mounts the shell inside a real router at `initialPath`, so active state is resolved the way it is in an
 * app — by the router's own location — rather than by a stub the component could disagree with.
 */
async function renderShell(props: Partial<AppShellProps> & Pick<AppShellProps, 'nav'>, initialPath = '/account'): Promise<void> {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell brand={{ name: 'Shadow' }} account={{ name: 'Ada' }} {...props}>
        <Outlet />
      </AppShell>
    ),
  });
  const routes = PATHS.map(path => createRoute({ getParentRoute: () => rootRoute, path, component: () => <div>content</div> }));
  const router = createRouter({ routeTree: rootRoute.addChildren(routes), history: createMemoryHistory({ initialEntries: [initialPath] }) });
  // The router resolves its first match asynchronously; rendering before that yields an empty tree.
  await router.load();
  render(<RouterProvider router={router} />);
}

function section(items: AppShellProps['nav']['sections'][number]['items'], label?: string): AppShellProps['nav'] {
  return { variant: 'sections', sections: [{ label, items }] };
}

describe('AppShell', () => {
  it('should render every destination in the config as a link', async () => {
    await renderShell({
      nav: section([
        { to: '/account', label: 'Overview' },
        { to: '/account/security', label: 'Security' },
      ]),
    });

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Security' })).toBeInTheDocument();
  });

  it('should mark the destination matching the current route as current', async () => {
    await renderShell(
      {
        nav: section([
          { to: '/account', label: 'Overview', exact: true },
          { to: '/account/security', label: 'Security' },
        ]),
      },
      '/account/security',
    );

    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('should keep an exact item unlit on a descendant route', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Overview', exact: true }]) }, '/account/sessions');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('should light a prefix item on a descendant route', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Account' }]) }, '/account/sessions');
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
  });

  it('should render a section label', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Overview' }], 'Account') });
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('should omit hidden items, sections and branches', async () => {
    await renderShell({
      nav: {
        variant: 'sections',
        sections: [
          {
            items: [
              { to: '/account', label: 'Overview' },
              { to: '/console', label: 'Admin console', hidden: true },
              { label: 'Hidden group', items: [{ to: '/console', label: 'Buried' }], hidden: true },
            ],
          },
          { label: 'Gone', items: [{ to: '/console', label: 'Also buried' }], hidden: true },
        ],
      },
    });

    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin console' })).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden group')).not.toBeInTheDocument();
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  it('should render sub-children as a disclosure group that opens when it owns the route', async () => {
    await renderShell(
      {
        nav: section([{ label: 'Access', items: [{ to: '/account/security', label: 'Security' }] }]),
      },
      '/account/security',
    );

    expect(screen.getByRole('button', { name: /Access/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Security' })).toBeInTheDocument();
  });

  it('should leave a branch closed when it owns nothing on the current route', async () => {
    await renderShell({ nav: section([{ label: 'Access', items: [{ to: '/console', label: 'Console' }] }]) }, '/account');

    expect(screen.getByRole('button', { name: /Access/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Console' })).not.toBeInTheDocument();
  });

  it('should render an external item as a new-tab anchor that is never active', async () => {
    await renderShell({ nav: section([{ to: 'https://forge.shadow.app', label: 'Write a novel', external: true }]) });

    const link = screen.getByRole('link', { name: /Write a novel/ });
    expect(link).toHaveAttribute('href', 'https://forge.shadow.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('should render a badge only for a positive count', async () => {
    await renderShell({
      nav: section([
        { to: '/account', label: 'Review', badge: { count: 3, intent: 'warning' } },
        { to: '/console', label: 'Proposals', badge: { count: 0 } },
      ]),
    });

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should substitute route params when resolving the active destination', async () => {
    await renderShell(
      {
        nav: section([{ to: '/novels/$novelId/overview', params: { novelId: 'abc' }, label: 'Overview' }]),
      },
      '/novels/abc/overview',
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('should render the project switcher for the project variant', async () => {
    const onSelect = vi.fn();
    await renderShell({
      nav: {
        variant: 'project',
        project: {
          current: { id: 'a', label: 'Alpha' },
          options: [
            { id: 'a', label: 'Alpha' },
            { id: 'b', label: 'Beta' },
          ],
          onSelect,
        },
        sections: [{ items: [{ to: '/account', label: 'Overview' }] }],
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Alpha — switch' }));
    await userEvent.click(await screen.findByRole('button', { name: /Beta/ }));

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('should not render a switcher for the sections variant', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Overview' }]) });
    expect(screen.queryByRole('button', { name: /switch/ })).not.toBeInTheDocument();
  });

  it('should place the account menu in the top bar and nowhere else', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Overview' }]), account: { name: 'Ada', onSignOut: vi.fn() } });

    const triggers = screen.getAllByRole('button', { name: 'Account menu' });
    expect(triggers).toHaveLength(1);
    expect(screen.getByRole('banner')).toContainElement(triggers[0] ?? null);
  });

  it('should render the brand, breadcrumb and chrome slots', async () => {
    await renderShell({
      nav: section([{ to: '/account', label: 'Overview' }]),
      brand: { name: 'Shadow Identity', tagline: 'Operator console' },
      tone: 'warning',
      breadcrumb: <span>Account / Overview</span>,
      status: <span>AAL2</span>,
      actions: <button type="button">Notifications</button>,
      sidebarFooter: <span>Lifecycle</span>,
    });

    expect(screen.getByText('Shadow Identity')).toBeInTheDocument();
    expect(screen.getByText('Operator console')).toBeInTheDocument();
    expect(screen.getByText('Account / Overview')).toBeInTheDocument();
    expect(screen.getByText('AAL2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Lifecycle')).toBeInTheDocument();
  });

  it('should render its children in the content region', async () => {
    await renderShell({ nav: section([{ to: '/account', label: 'Overview' }]) });
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
