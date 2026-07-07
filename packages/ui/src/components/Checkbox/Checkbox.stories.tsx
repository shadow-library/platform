/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Checkbox } from './Checkbox';

/**
 * Declaring the constants
 */
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

/** Interactive — adjust props from the controls panel. */
export const Playground: Story = {};

/** Label plus a secondary description; the whole label is a click target. */
export const WithDescription: Story = {
  args: { label: 'Deployment emails', description: 'Success and failure notifications' },
};

/** A parent “some children checked” state. Click checks all; click again clears. */
export const Indeterminate: Story = {
  render: () => {
    const [checked, setChecked] = useState<boolean | 'indeterminate'>('indeterminate');
    return <Checkbox label='Select all' checked={checked} onCheckedChange={value => setChecked(value)} />;
  },
};

/** A vertical group — 12px gap with descriptions. */
export const Group: Story = {
  render: () => {
    const [state, setState] = useState({ emails: true, digest: false, mentions: true });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Checkbox
          label='Deployment emails'
          description='Success and failure notifications'
          checked={state.emails}
          onCheckedChange={v => setState(s => ({ ...s, emails: v === true }))}
        />
        <Checkbox label='Weekly digest' description='Usage summary every Monday' checked={state.digest} onCheckedChange={v => setState(s => ({ ...s, digest: v === true }))} />
        <Checkbox label='Mention alerts' description='When someone @mentions you' checked={state.mentions} onCheckedChange={v => setState(s => ({ ...s, mentions: v === true }))} />
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

/** A bare box for tables and Multi Select — requires an `aria-label`. */
export const Standalone: Story = {
  args: { label: undefined, 'aria-label': 'Select row' },
};
