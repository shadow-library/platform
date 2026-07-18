/**
 * Importing npm packages
 */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Sidebar } from '../Sidebar';
import { TopNavigation } from '../TopNavigation';
import { Page, Shell } from './Shell';

/**
 * Declaring the constants
 */
function stubMatchMedia(desktop: boolean) {
  let matches = desktop;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    resize(next: boolean): void {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function MobileShell({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Shell
      sidebar={
        <Sidebar workspace="acme-prod" collapsed={collapsed} onCollapsedChange={() => undefined}>
          <Sidebar.Item href="#services" active>
            Services
          </Sidebar.Item>
          <Sidebar.Item href="#deploys">Deploys</Sidebar.Item>
        </Sidebar>
      }
      topbar={
        <TopNavigation brand="Acme">
          <TopNavigation.Item href="#overview" active>
            Overview
          </TopNavigation.Item>
        </TopNavigation>
      }
    >
      content
    </Shell>
  );
}

describe('Shell', () => {
  it('renders sidebar, topbar, and a main landmark with a skip link first', () => {
    render(
      <Shell sidebar={<nav aria-label="Main">nav</nav>} topbar={<header>bar</header>}>
        <div>content</div>
      </Shell>,
    );
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#sh-main-content');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'sh-main-content');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('mounts dark theme and compact density on the root', () => {
    const { container } = render(<Shell theme="dark" density="compact" />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('dark');
    expect(root).toHaveAttribute('data-density', 'compact');
  });
});

describe('Shell · mobile navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces the hamburger only when the top bar sits inside a shell with a sidebar', () => {
    stubMatchMedia(false);
    const { unmount } = render(<MobileShell />);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    unmount();
    render(
      <TopNavigation brand="Acme">
        <TopNavigation.Item href="#overview">Overview</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });

  it('opens the nav drawer from the hamburger and projects the sidebar into it', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Deploys' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation', hidden: true })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the drawer when a navigation item is chosen', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Navigation' })).getByRole('link', { name: 'Deploys' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the drawer sidebar expanded and toggle-free even when the desktop sidebar is a rail', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<MobileShell collapsed />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('link', { name: 'Deploys' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Expand navigation' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Collapse navigation' })).not.toBeInTheDocument();
  });

  it('closes the drawer on Escape', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('dismisses the drawer when the viewport grows back to desktop', async () => {
    const media = stubMatchMedia(false);
    const user = userEvent.setup();
    render(<MobileShell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
    act(() => media.resize(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Page', () => {
  it('renders the header with title, description, and actions', () => {
    render(
      <Page title="Services" description="Everything running in acme-prod" actions={<button type="button">New service</button>}>
        <div>page body</div>
      </Page>,
    );
    expect(screen.getByRole('heading', { name: 'Services', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Everything running in acme-prod')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New service' })).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('omits the header when there is nothing to show', () => {
    render(<Page>just content</Page>);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByText('just content')).toBeInTheDocument();
  });
});
