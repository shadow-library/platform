/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { NotificationCenter } from './NotificationCenter';
import { type NotificationItem } from './NotificationCenter.types';

/**
 * Declaring the constants
 */
const seed: NotificationItem[] = [
  {
    id: '1',
    actor: 'Jon Abara',
    action: 'requested access to the billing workspace',
    time: '12 minutes ago',
    date: new Date(),
    unread: true,
    category: 'requests',
    actions: [
      { id: 'approve', label: 'Approve' },
      { id: 'decline', label: 'Decline', variant: 'secondary' },
    ],
  },
  { id: '2', actor: 'Mira Kessler', action: 'mentioned you in “Q3 capacity plan”', time: '1 hour ago', date: new Date(), unread: true, category: 'mentions' },
  { id: '3', actor: 'deploy-bot', action: 'rollout to us-east-1 completed', time: '2 hours ago', date: new Date(), unread: true, category: 'system' },
  { id: '4', actor: 'Ana Sousa', action: 'assigned you “Rotate API credentials”', time: 'Yesterday', date: new Date(Date.now() - 86400000), unread: false, category: 'requests' },
];

const filters = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread', count: 3 },
  { id: 'mentions', label: 'Mentions' },
];

const meta = {
  title: 'Components/NotificationCenter',
  component: NotificationCenter,
  parameters: { layout: 'centered' },
  args: { items: seed },
} satisfies Meta<typeof NotificationCenter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [items, setItems] = useState(seed);
    const markRead = (id: string) => setItems(list => list.map(item => (item.id === id ? { ...item, unread: false } : item)));
    return (
      <NotificationCenter
        items={items}
        filters={filters}
        defaultOpen
        onRead={markRead}
        onReadAll={() => setItems(list => list.map(item => ({ ...item, unread: false })))}
        onAction={(item, actionId) =>
          setItems(list =>
            list.map(entry => (entry.id === item.id ? { ...entry, actions: undefined, receipt: `${actionId === 'approve' ? 'Approved' : 'Declined'} · just now` } : entry)),
          )
        }
        viewAllHref='#/inbox'
      />
    );
  },
};

export const DotBadge: Story = {
  render: () => <NotificationCenter items={seed} badge='dot' />,
};

export const Empty: Story = {
  render: () => <NotificationCenter items={[]} defaultOpen />,
};
