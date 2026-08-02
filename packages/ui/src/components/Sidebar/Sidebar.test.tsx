/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Sidebar, useSidebar } from './Sidebar';

/**
 * Declaring the constants
 */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: key => void map.delete(key),
    clear: () => map.clear(),
    key: index => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('Sidebar', () => {
  it('renders a Main nav landmark with links and marks the active item', () => {
    render(
      <Sidebar workspace="acme-prod">
        <Sidebar.Section label="Platform">
          <Sidebar.Item href="/services" active>
            Services
          </Sidebar.Item>
          <Sidebar.Item href="/deploys">Deploys</Sidebar.Item>
        </Sidebar.Section>
      </Sidebar>,
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    const active = screen.getByRole('link', { name: 'Services' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Deploys' })).not.toHaveAttribute('aria-current');
  });

  it('toggles collapse through the labelled button', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    render(<Sidebar workspace="acme-prod" onCollapsedChange={onCollapsedChange} />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('keeps a sidebar that asked for nothing toggle-free', () => {
    render(<Sidebar workspace="acme-prod" />);
    expect(screen.queryByRole('button', { name: /navigation$/ })).not.toBeInTheDocument();
  });

  it('owns the rail state when uncontrolled', async () => {
    const user = userEvent.setup();
    render(<Sidebar workspace="acme-prod" defaultCollapsed={false} />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  describe('collapse persistence', () => {
    beforeEach(() => vi.stubGlobal('localStorage', makeStorage()));
    afterEach(() => vi.unstubAllGlobals());

    it('persists and restores the rail choice through storageKey', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<Sidebar workspace="acme-prod" storageKey="sh-rail" />);
      await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
      expect(localStorage.getItem('sh-rail')).toBe('true');

      unmount();
      render(<Sidebar workspace="acme-prod" storageKey="sh-rail" />);
      expect(await screen.findByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
    });

    it('server-renders defaultCollapsed rather than the stored choice', () => {
      localStorage.setItem('sh-rail', 'true');
      // Resolving storage during render would emit markup the client could not hydrate to.
      const html = renderToStaticMarkup(<Sidebar workspace="acme-prod" storageKey="sh-rail" defaultCollapsed={false} />);
      expect(html).toContain('Collapse navigation');
      expect(html).not.toContain('Expand navigation');
    });
  });

  it('points the collapse chevron the right way for each mode', () => {
    const { rerender } = render(<Sidebar workspace="acme-prod" onCollapsedChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('data-direction', 'left');
    rerender(<Sidebar workspace="acme-prod" collapsed onCollapsedChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('data-direction', 'right');
  });

  it('expands and collapses a group', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar>
        <Sidebar.Group label="Settings">
          <Sidebar.Item href="/settings/general">General</Sidebar.Item>
        </Sidebar.Group>
      </Sidebar>,
    );
    const trigger = screen.getByRole('button', { name: 'Settings' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'General' })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'General' })).toBeInTheDocument();
  });

  it('wraps group items in list items', () => {
    render(
      <Sidebar>
        <Sidebar.Group label="Settings" defaultOpen>
          <Sidebar.Item href="/a">Alpha</Sidebar.Item>
          <Sidebar.Item href="/b">Bravo</Sidebar.Item>
        </Sidebar.Group>
      </Sidebar>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('supports a controlled group', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Sidebar>
        <Sidebar.Group label="Settings" open={false} onOpenChange={onOpenChange}>
          <Sidebar.Item href="/a">Alpha</Sidebar.Item>
        </Sidebar.Group>
      </Sidebar>,
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // The caller owns the state, so nothing opens until it says so.
    expect(screen.queryByRole('link', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('names the group trigger and reaches its items through a flyout in rail mode', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar collapsed>
        <Sidebar.Group label="Settings" icon={<svg aria-hidden="true" />}>
          <Sidebar.Item href="/settings/general">General</Sidebar.Item>
        </Sidebar.Group>
      </Sidebar>,
    );
    const trigger = screen.getByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('link', { name: 'General' })).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/settings/general');
  });

  it('keeps the header identity mark visible in rail mode', () => {
    function Mark() {
      const { collapsed } = useSidebar();
      return <span data-testid="mark">{collapsed ? 'A' : 'acme-prod'}</span>;
    }
    render(<Sidebar collapsed workspace={<Mark />} onCollapsedChange={() => {}} />);
    // The logo mark stays mounted (icon-only) rather than being dropped when minimised.
    expect(screen.getByTestId('mark')).toHaveTextContent('A');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  it('hides labels but keeps accessible names in rail mode', () => {
    render(
      <Sidebar collapsed>
        <Sidebar.Item href="/services" icon={<svg aria-hidden="true" />}>
          Services
        </Sidebar.Item>
      </Sidebar>,
    );
    expect(screen.getByRole('link', { name: 'Services' })).toBeInTheDocument();
  });

  it('slots onto a router-style link with asChild, icon and all', () => {
    render(
      <Sidebar>
        <Sidebar.Item asChild icon={<svg aria-hidden="true" />} badge={3} active>
          <a href="/services">Services</a>
        </Sidebar.Item>
      </Sidebar>,
    );
    const link = screen.getByRole('link', { name: 'Services 3' });
    expect(link).toHaveAttribute('href', '/services');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveAttribute('data-active');
    // The caller's own children are rewrapped in the label span, so both branches emit the same markup.
    expect(link.querySelector('svg')).toBeInTheDocument();
  });

  it('slots onto a link with asChild when no icon is given', () => {
    render(
      <Sidebar>
        <Sidebar.Item asChild>
          <a href="/deploys">Deploys</a>
        </Sidebar.Item>
      </Sidebar>,
    );
    expect(screen.getByRole('link', { name: 'Deploys' })).toHaveAttribute('href', '/deploys');
  });

  it('drops the label but keeps the accessible name for an asChild item in rail mode', () => {
    render(
      <Sidebar collapsed>
        <Sidebar.Item asChild icon={<svg aria-hidden="true" />} label="Services">
          <a href="/services">Services</a>
        </Sidebar.Item>
      </Sidebar>,
    );
    const link = screen.getByRole('link', { name: 'Services' });
    expect(link).toHaveAttribute('href', '/services');
    expect(link).toHaveTextContent('');
  });

  it('chains the caller onClick through an asChild item', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Sidebar>
        <Sidebar.Item asChild onClick={onClick}>
          <a href="/services">Services</a>
        </Sidebar.Item>
      </Sidebar>,
    );
    await user.click(screen.getByRole('link', { name: 'Services' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Sidebar.Switcher', () => {
  const OPTIONS = [
    { id: 'a', label: 'Alpha', caption: 'source · #a' },
    { id: 'b', label: 'Beta', caption: 'new · #b' },
  ];

  it('should label the trigger with the current option', () => {
    render(
      <Sidebar>
        <Sidebar.Switcher current={OPTIONS[0]} options={OPTIONS} onSelect={vi.fn()} />
      </Sidebar>,
    );
    expect(screen.getByRole('button', { name: 'Alpha — switch' })).toBeInTheDocument();
  });

  it('should fall back to the empty label when nothing is selected', () => {
    render(
      <Sidebar>
        <Sidebar.Switcher options={OPTIONS} emptyLabel="All projects" onSelect={vi.fn()} />
      </Sidebar>,
    );
    expect(screen.getByRole('button', { name: 'All projects — switch' })).toBeInTheDocument();
  });

  it('should report the chosen option id and close the menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Sidebar>
        <Sidebar.Switcher current={OPTIONS[0]} options={OPTIONS} onSelect={onSelect} />
      </Sidebar>,
    );

    await user.click(screen.getByRole('button', { name: 'Alpha — switch' }));
    await user.click(await screen.findByRole('button', { name: /Beta/ }));

    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('button', { name: /Beta/ })).not.toBeInTheDocument();
  });

  it('should mark the current option with aria-current', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar>
        <Sidebar.Switcher current={OPTIONS[0]} options={OPTIONS} onSelect={vi.fn()} />
      </Sidebar>,
    );

    await user.click(screen.getByRole('button', { name: 'Alpha — switch' }));

    expect(await screen.findByRole('button', { name: /Alpha/, current: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Beta/ })).not.toHaveAttribute('aria-current');
  });

  it('should run the footer action and close', async () => {
    const user = userEvent.setup();
    const onFooter = vi.fn();
    render(
      <Sidebar>
        <Sidebar.Switcher options={OPTIONS} onSelect={vi.fn()} footerAction={{ label: 'View all projects', onSelect: onFooter }} />
      </Sidebar>,
    );

    await user.click(screen.getByRole('button', { name: /switch/ }));
    await user.click(await screen.findByRole('button', { name: 'View all projects' }));

    expect(onFooter).toHaveBeenCalledOnce();
  });

  it('should say so when there is nothing to switch to', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar>
        <Sidebar.Switcher options={[]} onSelect={vi.fn()} />
      </Sidebar>,
    );

    await user.click(screen.getByRole('button', { name: /switch/ }));

    expect(await screen.findByText('Nothing to switch to.')).toBeInTheDocument();
  });

  it('should keep the full option list reachable in rail mode', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar collapsed>
        <Sidebar.Switcher current={OPTIONS[0]} options={OPTIONS} onSelect={vi.fn()} />
      </Sidebar>,
    );

    await user.click(screen.getByRole('button', { name: 'Alpha — switch' }));

    expect(await screen.findByRole('button', { name: /Beta/ })).toBeInTheDocument();
  });
});
