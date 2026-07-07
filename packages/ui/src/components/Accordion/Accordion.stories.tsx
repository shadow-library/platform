/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Badge } from '../Badge';
import { Accordion } from './Accordion';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  parameters: { layout: 'padded' },
  args: { type: 'single' },
  decorators: [
    Story => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => (
    <Accordion type='single' collapsible defaultValue='deploys'>
      <Accordion.Item value='deploys' title='How do deploys work?'>
        Services deploy from a connected repository on every push to the default branch.
      </Accordion.Item>
      <Accordion.Item
        value='billing'
        title='Billing'
        meta={
          <Badge intent='warning' dot>
            2 issues
          </Badge>
        }
      >
        Your plan renews monthly. Two invoices need attention.
      </Accordion.Item>
      <Accordion.Item value='legacy' title='Legacy API (disabled)' disabled>
        The legacy API shuts down in 30 days.
      </Accordion.Item>
    </Accordion>
  ),
};

export const Contained: Story = {
  render: () => (
    <Accordion type='multiple' variant='contained' defaultValue={['env']}>
      <Accordion.Item value='env' title='Environment variables'>
        Key–value pairs injected at runtime.
      </Accordion.Item>
      <Accordion.Item value='scaling' title='Scaling'>
        Horizontal scaling rules and thresholds.
      </Accordion.Item>
    </Accordion>
  ),
};
