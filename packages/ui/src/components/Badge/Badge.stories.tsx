/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Badge } from './Badge';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
  args: { children: 'Active', intent: 'success', variant: 'soft', dot: true },
  argTypes: {
    intent: { control: 'inline-radio', options: ['neutral', 'info', 'success', 'warning', 'danger'] },
    variant: { control: 'inline-radio', options: ['soft', 'outline', 'count', 'dot'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    dot: { control: 'boolean' },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The closed intent set, soft variant with dots. */
export const Intents: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge intent="neutral" dot>
        Archived
      </Badge>
      <Badge intent="info" dot>
        Deploying
      </Badge>
      <Badge intent="success" dot>
        Active
      </Badge>
      <Badge intent="warning" dot>
        Degraded
      </Badge>
      <Badge intent="danger" dot>
        Failed
      </Badge>
    </div>
  ),
};

/** Outline (version/env labels) and count (notifications). */
export const OutlineAndCount: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Badge variant="outline">v2.14</Badge>
      <Badge variant="count" intent="danger" aria-label="12 unread">
        {12}
      </Badge>
      <Badge variant="count" intent="neutral" max={99}>
        {128}
      </Badge>
    </div>
  ),
};

/** Dot-only — the calmest marker for dense table cells. */
export const DotOnly: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Badge variant="dot" intent="success">
        checkout-service
      </Badge>
      <Badge variant="dot" intent="danger">
        billing-service
      </Badge>
    </div>
  ),
};
