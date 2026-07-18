/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { Breadcrumbs } from './Breadcrumbs';

/**
 * Declaring the constants
 */

describe('Breadcrumbs', () => {
  it('renders the WAI-ARIA breadcrumb structure', () => {
    render(
      <Breadcrumbs>
        <Breadcrumbs.Item href="/workspaces">Workspaces</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/workspaces/acme">acme-prod</Breadcrumbs.Item>
        <Breadcrumbs.Item current>checkout-service</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    const current = screen.getByText('checkout-service');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).toBe('SPAN');
  });

  it('collapses the middle into an overflow menu past maxVisible', async () => {
    const user = userEvent.setup();
    render(
      <Breadcrumbs maxVisible={4}>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/b">Bravo</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/c">Charlie</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/d">Delta</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Echo</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delta' })).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bravo' })).not.toBeInTheDocument();

    const overflow = screen.getByRole('button', { name: 'Show 2 hidden levels' });
    await user.click(overflow);
    expect(screen.getByRole('link', { name: 'Bravo' })).toHaveAttribute('href', '/b');
    expect(screen.getByRole('link', { name: 'Charlie' })).toBeInTheDocument();
  });

  it('does not collapse at or under maxVisible', () => {
    render(
      <Breadcrumbs maxVisible={4}>
        <Breadcrumbs.Item href="/a">Alpha</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/b">Bravo</Breadcrumbs.Item>
        <Breadcrumbs.Item current>Charlie</Breadcrumbs.Item>
      </Breadcrumbs>,
    );
    expect(screen.queryByRole('button', { name: /hidden levels/ })).not.toBeInTheDocument();
  });
});
