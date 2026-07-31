/**
 * Importing npm packages
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { NotificationCenter } from './NotificationCenter';
import { type NotificationItem } from './NotificationCenter.types';

/**
 * Declaring the constants
 */
const items: NotificationItem[] = [
  {
    id: '1',
    actor: 'Jon Abara',
    action: 'requested access',
    time: '12m ago',
    unread: true,
    category: 'requests',
    actions: [
      { id: 'approve', label: 'Approve' },
      { id: 'decline', label: 'Decline' },
    ],
  },
  { id: '2', actor: 'Mira Kessler', action: 'mentioned you', time: '1h ago', unread: true, category: 'mentions' },
  { id: '3', actor: 'Ana Sousa', action: 'assigned you a task', time: '5h ago', unread: false, category: 'requests' },
];

describe('NotificationCenter', () => {
  it('announces the unread count on the bell', () => {
    render(<NotificationCenter items={items} />);
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument();
  });

  it('opens a feed of notifications and marks unread items in their name', async () => {
    const user = userEvent.setup();
    render(<NotificationCenter items={items} />);
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByRole('feed')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Jon Abara requested access, unread/ })).toBeInTheDocument();
  });

  it('inline actions resolve without navigating', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationCenter items={items} onAction={onAction} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), 'approve');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('marks an item read and navigates on row click', async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const onNavigate = vi.fn();
    render(<NotificationCenter items={items} onRead={onRead} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('article', { name: /Mira Kessler/ }));
    expect(onRead).toHaveBeenCalledWith('2');
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  });

  it('filters to unread via the built-in filter tab', async () => {
    const user = userEvent.setup();
    render(
      <NotificationCenter
        items={items}
        filters={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread', count: 2 },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(screen.queryByRole('article', { name: /Ana Sousa/ })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: /Jon Abara/ })).toBeInTheDocument();
  });
});
