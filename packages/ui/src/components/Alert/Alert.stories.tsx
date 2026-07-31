/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Alert } from './Alert';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Alert',
  component: Alert,
  parameters: { layout: 'padded' },
  args: { intent: 'info', title: 'Scheduled maintenance', children: 'Deploys pause Sunday 02:00–04:00 UTC. Running services are unaffected.' },
  argTypes: {
    intent: { control: 'inline-radio', options: ['info', 'success', 'warning', 'danger'] },
  },
  decorators: [
    Story => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Intents: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert intent="info" title="Scheduled maintenance">
        Deploys pause Sunday 02:00–04:00 UTC.
      </Alert>
      <Alert intent="success" title="Migration complete">
        All 214 records now use the v2 schema.
      </Alert>
      <Alert intent="warning" title="Approaching plan limit" action={{ label: 'Upgrade', onClick: () => {} }}>
        You have used 91% of included build minutes this cycle.
      </Alert>
      <Alert intent="danger" title="Payment failed" action={{ label: 'Update card', onClick: () => {} }}>
        We could not charge the card ending 4242. Deploys lock in 7 days.
      </Alert>
    </div>
  ),
};

/** Dismissible info notice. */
export const Dismissible: Story = {
  args: { onDismiss: () => {} },
};
