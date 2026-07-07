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
  it('renders a Main nav landmark with links and marks the active one', () => {
    render(
      <TopNavigation brand='Shadow'>
        <TopNavigation.Item href='/overview' active>
          Overview
        </TopNavigation.Item>
        <TopNavigation.Item href='/services'>Services</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Services' })).not.toHaveAttribute('aria-current');
  });

  it('collapses links past maxVisible into a More menu, preserving order', async () => {
    const user = userEvent.setup();
    render(
      <TopNavigation maxVisible={2}>
        <TopNavigation.Item href='/a'>Alpha</TopNavigation.Item>
        <TopNavigation.Item href='/b'>Bravo</TopNavigation.Item>
        <TopNavigation.Item href='/c'>Charlie</TopNavigation.Item>
        <TopNavigation.Item href='/d'>Delta</TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bravo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Charlie' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More links' }));
    expect(screen.getByRole('link', { name: 'Charlie' })).toHaveAttribute('href', '/c');
    expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument();
  });

  it('marks the More trigger active when an overflowed link is active', () => {
    render(
      <TopNavigation maxVisible={1}>
        <TopNavigation.Item href='/a'>Alpha</TopNavigation.Item>
        <TopNavigation.Item href='/b' active>
          Bravo
        </TopNavigation.Item>
      </TopNavigation>,
    );
    expect(screen.getByRole('button', { name: 'More links' })).toHaveAttribute('data-active');
  });
});
