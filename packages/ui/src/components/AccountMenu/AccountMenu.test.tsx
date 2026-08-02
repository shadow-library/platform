/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { AccountMenu } from './AccountMenu';

/**
 * Declaring the constants
 */

describe('AccountMenu', () => {
  it('should render an avatar trigger naming the account menu', () => {
    render(<AccountMenu name="Ada Lovelace" />);
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  });

  it('should show the name and email in the menu header once opened', async () => {
    const user = userEvent.setup();
    render(<AccountMenu name="Ada Lovelace" email="ada@shadow.app" />);

    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@shadow.app')).toBeInTheDocument();
  });

  it('should render app-specific items above sign out and invoke their handlers', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AccountMenu name="Ada" items={[{ id: 'projects', label: 'All projects', onSelect }]} onSignOut={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All projects' }));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('should invoke onSignOut from the sign-out row', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<AccountMenu name="Ada" onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('should omit the sign-out row when no handler is given', async () => {
    const user = userEvent.setup();
    render(<AccountMenu name="Ada" items={[{ id: 'settings', label: 'Settings', onSelect: vi.fn() }]} />);

    await user.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('should render a sign-in link instead of the menu when signed out', () => {
    render(<AccountMenu signedOut={{ href: '/login' }} />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
  });

  it('should keep the signed-out surface even when a name is present, since a failed profile fetch is not a logged-out session', () => {
    render(<AccountMenu name="Ada" signedOut={{ href: '/login', label: 'Log in' }} />);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
  });

  it('should open the menu from the keyboard', async () => {
    const user = userEvent.setup();
    render(<AccountMenu name="Ada" onSignOut={vi.fn()} />);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
