/**
 * Importing npm packages
 */
import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Banner } from './Banner';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Banner',
  component: Banner,
  parameters: { layout: 'fullscreen' },
  args: { message: 'API latency is elevated in us-east-1. Monitoring.' },
} satisfies Meta<typeof Banner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Warning: Story = {
  args: { intent: 'warning', lead: 'Degraded performance:', action: { label: 'Status page', href: '#/status' } },
};

export const Info: Story = {
  args: { intent: 'info', message: 'Trial ends in 3 days. Pick a plan to keep your workspaces.', action: { label: 'Choose plan', href: '#/billing' }, dismissable: true },
};

export const Danger: Story = {
  args: { intent: 'danger', lead: 'Payment failed', message: '— update your card to keep syncing.', action: { label: 'Update card', href: '#/billing' } },
};

export const Success: Story = {
  args: { intent: 'success', message: 'All systems operational.', dismissable: true },
};

export const ActionLoading: Story = {
  args: { intent: 'danger', message: 'Connection lost.', action: { label: 'Retry connection', onClick: () => {}, loading: true } },
};
