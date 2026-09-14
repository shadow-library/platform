/**
 * Importing npm packages
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { TopNavigation } from './TopNavigation';

/**
 * Declaring the constants
 */
const css = readFileSync(path.join(import.meta.dirname, 'TopNavigation.module.css'), 'utf-8');

describe('TopNavigation', () => {
  it('renders a banner holding a Top nav landmark and marks the active link', () => {
    render(
      <TopNavigation brand="Shadow">
        <TopNavigation.Item href="/overview" active>
          Overview
        </TopNavigation.Item>
        <TopNavigation.Item href="/services">Services</TopNavigation.Item>
      </TopNavigation>,
    );
    const banner = screen.getByRole('banner');
    const nav = screen.getByRole('navigation', { name: 'Top' });
    expect(banner).toContainElement(nav);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Services' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the brand and the utility cluster out of the nav landmark', () => {
    render(
      <TopNavigation brand="Shadow" utility={<button type="button">Account</button>}>
        <TopNavigation.Item href="/overview">Overview</TopNavigation.Item>
      </TopNavigation>,
    );
    const nav = screen.getByRole('navigation', { name: 'Top' });
    expect(nav).not.toContainElement(screen.getByRole('button', { name: 'Account' }));
    expect(nav).toContainElement(screen.getByRole('link', { name: 'Overview' }));
  });

  it('collapses links past maxVisible into a More menu, preserving order', async () => {
    const user = userEvent.setup();
    render(
      <TopNavigation maxVisible={2}>
        <TopNavigation.Item href="/a">Alpha</TopNavigation.Item>
        <TopNavigation.Item href="/b">Bravo</TopNavigation.Item>
        <TopNavigation.Item href="/c">Charlie</TopNavigation.Item>
        <TopNavigation.Item href="/d">Delta</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bravo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Charlie' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More links' }));
    expect(screen.getByRole('link', { name: 'Charlie' })).toHaveAttribute('href', '/c');
    expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument();
  });

  it('keeps asChild router links intact when they overflow', async () => {
    const user = userEvent.setup();
    render(
      <TopNavigation maxVisible={1}>
        <TopNavigation.Item href="/a">Alpha</TopNavigation.Item>
        <TopNavigation.Item asChild active>
          <a href="/b">Bravo</a>
        </TopNavigation.Item>
      </TopNavigation>,
    );
    await user.click(screen.getByRole('button', { name: 'More links' }));
    // Rebuilding the anchor from item.props.href dropped the href entirely for asChild items, which
    // also stripped the link role.
    const overflowed = screen.getByRole('link', { name: 'Bravo' });
    expect(overflowed).toHaveAttribute('href', '/b');
    expect(overflowed).toHaveAttribute('aria-current', 'page');
  });

  it('renders the search slot outside the nav landmark', () => {
    render(
      <TopNavigation brand="Shadow" search={<button type="button">Search</button>}>
        <TopNavigation.Item href="/overview">Overview</TopNavigation.Item>
      </TopNavigation>,
    );
    const search = screen.getByRole('button', { name: 'Search' });
    expect(screen.getByRole('banner')).toContainElement(search);
    expect(screen.getByRole('navigation', { name: 'Top' })).not.toContainElement(search);
  });

  it('centres the search slot when the bar carries no destinations', () => {
    render(<TopNavigation brand="Shadow" search={<button type="button">Search</button>} utility={<button type="button">Account</button>} />);
    expect(screen.getByRole('banner')).toHaveAttribute('data-layout', 'centred');
  });

  it('keeps the flowing layout when destinations share the bar with the search slot', () => {
    render(
      <TopNavigation brand="Shadow" search={<button type="button">Search</button>}>
        <TopNavigation.Item href="/overview">Overview</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('banner')).not.toHaveAttribute('data-layout');
  });

  it('omits the nav landmark when the bar carries no destinations', () => {
    render(<TopNavigation brand="Shadow" utility={<button type="button">Account</button>} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('should not overflow the centred top bar when utility content is wide', () => {
    render(
      <TopNavigation
        brand="Shadow Memoir Operator Workspace"
        search={<button type="button">Log something, or jump to a screen</button>}
        utility={
          <>
            <button type="button" aria-label="Notifications">
              Bell
            </button>
            <button type="button" aria-label="Account menu">
              Account
            </button>
          </>
        }
      />,
    );
    expect(screen.getByRole('banner')).toHaveAttribute('data-layout', 'centred');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();

    // Regression guard: the centred bar's middle column must stay a flexible (fr) track, not `auto`, and
    // `.start`/`.utility` must opt back into their protected content minimum — an `auto` column claims its
    // full content width before the outer 1fr columns get a share, pushing the utility cluster off-screen.
    const centredRule = css.slice(css.indexOf(".bar[data-layout='centred'] {"));
    expect(centredRule).not.toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
    expect(centredRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*\d+fr\)\s*minmax\(auto,\s*1fr\)/);
    expect(centredRule).toContain('.start');
    expect(centredRule).toContain('.utility');
    expect(centredRule).toContain('min-width: auto;');
  });

  it('should let the brand shrink when the bar carries no destinations', () => {
    render(<TopNavigation brand={<span>Operator console / Users</span>} utility={<button type="button">Account</button>} />);
    expect(screen.getByText('Operator console / Users').parentElement).toHaveAttribute('data-shrink');

    const shrinkRule = css.slice(css.indexOf('.brand[data-shrink] {'), css.indexOf('}', css.indexOf('.brand[data-shrink] {')));
    expect(shrinkRule).toContain('flex-shrink: 1;');
    expect(shrinkRule).toContain('min-width: 0;');
  });

  it('should let the brand shrink in the centred layout', () => {
    render(<TopNavigation brand={<span>Forge</span>} search={<button type="button">Search</button>} />);
    expect(screen.getByRole('banner')).toHaveAttribute('data-layout', 'centred');
    expect(screen.getByText('Forge').parentElement).toHaveAttribute('data-shrink');
  });

  it('should keep the brand at its full width beside destinations', () => {
    render(
      <TopNavigation brand={<span>Shadow</span>}>
        <TopNavigation.Item href="/overview">Overview</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByText('Shadow').parentElement).not.toHaveAttribute('data-shrink');
  });

  it('marks the More trigger active when an overflowed link is active', () => {
    render(
      <TopNavigation maxVisible={1}>
        <TopNavigation.Item href="/a">Alpha</TopNavigation.Item>
        <TopNavigation.Item href="/b" active>
          Bravo
        </TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('button', { name: 'More links' })).toHaveAttribute('data-active');
  });
});
