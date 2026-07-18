/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Select } from './Select';

/**
 * Declaring the constants
 */
function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }} aria-hidden="true" />;
}

const meta = {
  title: 'Components/Select',
  component: Select,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Region', placeholder: 'Select region…', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    invalid: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  decorators: [
    Story => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — open, pick, reopen; the check marks the current value. */
export const Playground: Story = {
  render: args => (
    <Select {...args}>
      <Select.Item value="us-east-1">us-east-1</Select.Item>
      <Select.Item value="us-west-2">us-west-2</Select.Item>
      <Select.Item value="eu-central-1">eu-central-1</Select.Item>
      <Select.Item value="ap-southeast-2">ap-southeast-2</Select.Item>
    </Select>
  ),
};

/** Section labels and dividers organise 8–15 options with natural categories. */
export const Grouped: Story = {
  render: args => (
    <Select {...args}>
      <Select.Group label="US">
        <Select.Item value="us-east-1">us-east-1</Select.Item>
        <Select.Item value="us-west-2">us-west-2</Select.Item>
      </Select.Group>
      <Select.Separator />
      <Select.Group label="Europe">
        <Select.Item value="eu-central-1">eu-central-1</Select.Item>
        <Select.Item value="eu-west-1">eu-west-1</Select.Item>
      </Select.Group>
    </Select>
  ),
};

/** Two-line items for consequential choices like plan tiers. */
export const WithDescriptions: Story = {
  args: { placeholder: 'Choose a plan', 'aria-label': 'Plan' },
  render: args => (
    <Select {...args}>
      <Select.Item value="free" description="For side projects">
        Free
      </Select.Item>
      <Select.Item value="pro" description="For growing teams">
        Pro
      </Select.Item>
      <Select.Item value="enterprise" description="SSO, audit logs, SLA">
        Enterprise
      </Select.Item>
    </Select>
  ),
};

/** A leading icon per item; it repeats in the closed trigger. */
export const WithIcons: Story = {
  args: { placeholder: 'Environment', 'aria-label': 'Environment' },
  render: args => (
    <Select {...args}>
      <Select.Item value="production" icon={<Dot color="var(--sh-success-solid)" />}>
        Production
      </Select.Item>
      <Select.Item value="staging" icon={<Dot color="var(--sh-warning-solid)" />}>
        Staging
      </Select.Item>
      <Select.Item value="development" icon={<Dot color="var(--sh-text-tertiary)" />}>
        Development
      </Select.Item>
    </Select>
  ),
};

export const Sizes: Story = {
  render: args => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <Select key={size} {...args} size={size}>
          <Select.Item value="us-east-1">us-east-1</Select.Item>
          <Select.Item value="us-west-2">us-west-2</Select.Item>
        </Select>
      ))}
    </div>
  ),
};

/** Danger border/ring — presentation only; the message is rendered by Form Field. */
export const Invalid: Story = {
  args: { invalid: true },
  render: args => (
    <Select {...args}>
      <Select.Item value="us-east-1">us-east-1</Select.Item>
    </Select>
  ),
};

export const Controlled: Story = {
  render: args => {
    const [value, setValue] = useState('us-east-1');
    return (
      <Select {...args} value={value} onValueChange={setValue}>
        <Select.Item value="us-east-1">us-east-1</Select.Item>
        <Select.Item value="us-west-2">us-west-2</Select.Item>
      </Select>
    );
  },
};
