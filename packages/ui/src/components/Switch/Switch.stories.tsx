/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Switch } from './Switch';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  args: { label: 'Two-factor authentication', description: 'Require a code at sign-in' },
  argTypes: {
    pending: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — the settings row: label left, switch right. */
export const Playground: Story = {};

/** Feature name only, no description. */
export const LabelOnly: Story = {
  args: { description: undefined, label: 'Enable notifications' },
};

/** A stack of settings rows. */
export const SettingsRows: Story = {
  render: () => {
    const [state, setState] = useState({ tfa: true, sso: false, audit: true });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Switch label="Two-factor authentication" description="Require a code at sign-in" checked={state.tfa} onCheckedChange={v => setState(s => ({ ...s, tfa: v }))} />
        <Switch label="Enforce SSO" description="Members must sign in with your identity provider" checked={state.sso} onCheckedChange={v => setState(s => ({ ...s, sso: v }))} />
        <Switch label="Audit log streaming" description="Stream events to your SIEM" checked={state.audit} onCheckedChange={v => setState(s => ({ ...s, audit: v }))} />
      </div>
    );
  },
};

/** The async flip: the thumb moves optimistically while the track dims. */
export const Pending: Story = {
  args: { pending: true, checked: true, label: 'Enforce SSO', description: 'Applying…' },
};

export const Disabled: Story = {
  args: { disabled: true, checked: true, label: 'Enterprise SSO', description: 'Upgrade to enable' },
};

/** A bare switch — requires an `aria-label`. */
export const Standalone: Story = {
  args: { label: undefined, description: undefined, 'aria-label': 'Maintenance mode' },
};
