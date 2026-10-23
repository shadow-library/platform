import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { RadioGroup } from './RadioGroup';

const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Plan', defaultValue: 'pro' },
  argTypes: {
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: args => (
    <RadioGroup {...args}>
      <RadioGroup.Item value="starter" label="Starter" description="Up to 5 seats, community support" />
      <RadioGroup.Item value="pro" label="Pro" description="Unlimited seats, SSO, priority support" />
      <RadioGroup.Item value="enterprise" label="Enterprise" description="Dedicated infrastructure, custom SLAs" />
    </RadioGroup>
  ),
};

export const WithLabel: Story = {
  render: () => {
    const [value, setValue] = useState('team');
    return (
      <RadioGroup label="Visibility" value={value} onValueChange={setValue}>
        <RadioGroup.Item value="public" label="Public" description="Anyone with the link" />
        <RadioGroup.Item value="team" label="Team-only" description="Members of your workspace" />
        <RadioGroup.Item value="private" label="Private" description="Only you" />
      </RadioGroup>
    );
  },
};

export const LabelsOnly: Story = {
  render: args => (
    <RadioGroup {...args} defaultValue="monthly">
      <RadioGroup.Item value="monthly" label="Monthly" />
      <RadioGroup.Item value="annual" label="Annual" />
    </RadioGroup>
  ),
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: undefined },
  render: args => (
    <RadioGroup {...args}>
      <RadioGroup.Item value="starter" label="Starter" />
      <RadioGroup.Item value="pro" label="Pro" />
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: args => (
    <RadioGroup {...args}>
      <RadioGroup.Item value="starter" label="Starter" description="Up to 5 seats" />
      <RadioGroup.Item value="pro" label="Pro" description="Unlimited seats" />
    </RadioGroup>
  ),
};
