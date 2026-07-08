/**
 * Importing npm packages
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { Sidebar, useSidebar } from './Sidebar';

/**
 * Declaring the constants
 */

describe('Sidebar', () => {
  it('renders a Main nav landmark with links and marks the active item', () => {
    render(
      <Sidebar workspace='acme-prod'>
        <Sidebar.Section label='Platform'>
          <Sidebar.Item href='/services' active>
            Services
          </Sidebar.Item>
          <Sidebar.Item href='/deploys'>Deploys</Sidebar.Item>
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
    render(<Sidebar workspace='acme-prod' onCollapsedChange={onCollapsedChange} />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('points the collapse chevron the right way for each mode', () => {
    const { rerender } = render(<Sidebar workspace='acme-prod' onCollapsedChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('data-direction', 'left');
    rerender(<Sidebar workspace='acme-prod' collapsed onCollapsedChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('data-direction', 'right');
  });

  it('expands and collapses a group', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar>
        <Sidebar.Group label='Settings'>
          <Sidebar.Item href='/settings/general'>General</Sidebar.Item>
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

  it('keeps the header identity mark visible in rail mode', () => {
    function Mark() {
      const { collapsed } = useSidebar();
      return <span data-testid='mark'>{collapsed ? 'A' : 'acme-prod'}</span>;
    }
    render(<Sidebar collapsed workspace={<Mark />} onCollapsedChange={() => {}} />);
    // The logo mark stays mounted (icon-only) rather than being dropped when minimised.
    expect(screen.getByTestId('mark')).toHaveTextContent('A');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });

  it('hides labels but keeps accessible names in rail mode', () => {
    render(
      <Sidebar collapsed>
        <Sidebar.Item href='/services' icon={<svg aria-hidden='true' />}>
          Services
        </Sidebar.Item>
      </Sidebar>,
    );
    expect(screen.getByRole('link', { name: 'Services' })).toBeInTheDocument();
  });
});
