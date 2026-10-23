import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Checkbox } from './Checkbox';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  args: { label: 'Send weekly summary' },
  argTypes: {
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithDescription: Story = {
  args: { label: 'Deployment emails', description: 'Success and failure notifications' },
};

export const Indeterminate: Story = {
  render: () => {
    const [checked, setChecked] = useState<boolean | 'indeterminate'>('indeterminate');
    return <Checkbox label="Select all" checked={checked} onCheckedChange={value => setChecked(value)} />;
  },
};

export const Group: Story = {
  render: () => {
    const [state, setState] = useState({ emails: true, digest: false, mentions: true });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Checkbox
          label="Deployment emails"
          description="Success and failure notifications"
          checked={state.emails}
          onCheckedChange={v => setState(s => ({ ...s, emails: v === true }))}
        />
        <Checkbox label="Weekly digest" description="Usage summary every Monday" checked={state.digest} onCheckedChange={v => setState(s => ({ ...s, digest: v === true }))} />
        <Checkbox label="Mention alerts" description="When someone @mentions you" checked={state.mentions} onCheckedChange={v => setState(s => ({ ...s, mentions: v === true }))} />
      </div>
    );
  },
};

export const Invalid: Story = {
  args: { label: 'I understand this deletes all data', invalid: true },
};

export const Disabled: Story = {
  args: { label: 'Enterprise only', description: 'Upgrade to enable', disabled: true, checked: true },
};

export const Standalone: Story = {
  args: { label: undefined, 'aria-label': 'Select row' },
};
