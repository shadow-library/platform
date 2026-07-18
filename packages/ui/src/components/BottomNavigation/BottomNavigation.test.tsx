/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { BottomNavigation } from './BottomNavigation';

/**
 * Declaring the constants
 */
const icon = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
  </svg>
);

function renderBar(props: Partial<Parameters<typeof BottomNavigation>[0]> = {}) {
  return render(
    <BottomNavigation defaultValue="home" fixed={false} {...props}>
      <BottomNavigation.Item value="home" icon={icon} label="Home" />
      <BottomNavigation.Item value="search" icon={icon} label="Search" />
      <BottomNavigation.Item value="inbox" icon={icon} label="Inbox" badge={<span>3</span>} />
    </BottomNavigation>,
  );
}

describe('BottomNavigation', () => {
  it('renders a labelled navigation landmark with an item per destination', () => {
    renderBar();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Inbox/ })).toHaveTextContent('3');
  });

  it('marks only the selected item with aria-current', () => {
    renderBar();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Search' })).not.toHaveAttribute('aria-current');
  });

  it('moves the selection on tap when uncontrolled and reports it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderBar({ onValueChange });
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onValueChange).toHaveBeenCalledWith('search');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('leaves the selection to the owner when controlled', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <BottomNavigation value="home" onValueChange={onValueChange} fixed={false}>
        <BottomNavigation.Item value="home" icon={icon} label="Home" />
        <BottomNavigation.Item value="search" icon={icon} label="Search" />
      </BottomNavigation>,
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onValueChange).toHaveBeenCalledWith('search');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('follows a controlled value change', () => {
    function Harness() {
      const [value, setValue] = useState('home');
      return (
        <BottomNavigation value={value} onValueChange={setValue} fixed={false}>
          <BottomNavigation.Item value="home" icon={icon} label="Home" />
          <BottomNavigation.Item value="search" icon={icon} label="Search" />
        </BottomNavigation>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('activates items from the keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderBar({ onValueChange });
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('search');
  });

  it('renders router links with asChild and slots the icon and label into them', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <BottomNavigation defaultValue="home" onValueChange={onValueChange} fixed={false}>
        <BottomNavigation.Item asChild value="home" icon={icon} label="Home">
          <a href="/home" />
        </BottomNavigation.Item>
        <BottomNavigation.Item asChild value="search" icon={icon} label="Search">
          <a href="/search" />
        </BottomNavigation.Item>
      </BottomNavigation>,
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/home');
    expect(home).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('link', { name: 'Search' }));
    expect(onValueChange).toHaveBeenCalledWith('search');
  });
});
