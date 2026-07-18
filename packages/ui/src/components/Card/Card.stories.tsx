/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Card } from './Card';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'centered' },
  argTypes: {
    interactive: { control: 'boolean' },
    selected: { control: 'boolean' },
    padding: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  decorators: [
    Story => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Header + body + footer, separated by hairlines. */
export const Default: Story = {
  render: args => (
    <Card {...args}>
      <Card.Header title="API usage" />
      <Card.Body>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--sh-text-primary)', fontVariantNumeric: 'tabular-nums' }}>1.24M</div>
        <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)', marginTop: 2 }}>requests this month · 62% of quota</div>
      </Card.Body>
      <Card.Footer>
        <a href="#usage" style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 500 }}>
          View breakdown
        </a>
      </Card.Footer>
    </Card>
  ),
};

/** The whole card is a link (asChild + a real `<a>`); hover raises a border and e1 shadow. */
export const Interactive: Story = {
  render: () => (
    <Card asChild interactive>
      <a href="#overview">
        <Card.Header title="checkout-service" action={<span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--sh-success-solid)' }} />} />
        <Card.Body>
          <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>Deployed 12m ago · main · v2.14.0</div>
        </Card.Body>
      </a>
    </Card>
  ),
};

/** Selected card (card-radio / picker): accent border, color does the work. */
export const Selected: Story = {
  render: () => (
    <Card selected padding="md">
      <Card.Body>
        <div style={{ fontWeight: 600, color: 'var(--sh-text-primary)' }}>Pro plan</div>
        <div style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)', marginTop: 2 }}>$20 / seat · unlimited environments</div>
      </Card.Body>
    </Card>
  ),
};

/** A plain padded container — just a Body. */
export const BodyOnly: Story = {
  render: args => (
    <Card {...args}>
      <Card.Body>A quiet bounded surface for grouped content.</Card.Body>
    </Card>
  ),
};
