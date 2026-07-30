/**
 * Importing npm packages
 */

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

  it('omits the nav landmark when the bar carries no destinations', () => {
    render(<TopNavigation brand="Shadow" utility={<button type="button">Account</button>} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
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
