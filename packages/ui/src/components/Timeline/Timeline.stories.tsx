/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Timeline } from './Timeline';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Timeline',
  component: Timeline,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Timeline>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Feed: Story = {
  render: () => (
    <Timeline aria-label='Deploy activity'>
      <Timeline.Item status='success' title='Deployed v2.14.0' timestamp='2m ago'>
        checkout-service · main · 42s build
      </Timeline.Item>
      <Timeline.Item status='default' title='Pull request merged' timestamp='18m ago' />
      <Timeline.Item status='warning' title='Certificate expiring' timestamp='1h ago'>
        Signing key rotates in 3 days.
      </Timeline.Item>
      <Timeline.Item status='danger' title='Build failed' timestamp='Yesterday'>
        Step 3 exited with code 1.
      </Timeline.Item>
    </Timeline>
  ),
};

export const Process: Story = {
  render: () => (
    <Timeline aria-label='Order status'>
      <Timeline.Item status='completed' title='Order placed' timestamp='Mon' />
      <Timeline.Item status='completed' title='Shipped' timestamp='Tue' />
      <Timeline.Item status='current' title='In transit' timestamp='Now' />
      <Timeline.Item status='upcoming' title='Out for delivery' />
      <Timeline.Item status='upcoming' title='Delivered' />
    </Timeline>
  ),
};
