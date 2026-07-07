/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { FormField } from './FormField';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/FormField',
  component: FormField,
  parameters: { layout: 'centered' },
  args: { label: 'Display name', children: <Input placeholder='Acme Corp' /> },
  argTypes: {
    required: { control: 'boolean' },
    optional: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — label, helper, and markers wrap any control. */
export const Playground: Story = {
  args: { helper: 'Shown in the sidebar and invoices.' },
  render: args => (
    <FormField {...args}>
      <Input placeholder='Acme Corp' />
    </FormField>
  ),
};

/** Error replaces the helper in the same slot and propagates invalid to the control. */
export const WithError: Story = {
  args: { label: 'Workspace URL', required: true, error: 'Only lowercase letters, numbers, and hyphens.' },
  render: args => (
    <FormField {...args}>
      <Input prefix='https://' defaultValue='acme corp!' />
    </FormField>
  ),
};

/** Live validation: the error appears on blur and clears as the value becomes valid. */
export const LiveValidation: Story = {
  render: () => {
    const [value, setValue] = useState('acme corp!');
    const [touched, setTouched] = useState(false);
    const error = touched && !/^[a-z0-9-]*$/.test(value) ? 'Only lowercase letters, numbers, and hyphens.' : undefined;
    return (
      <FormField label='Workspace URL' required error={error} helper='Your workspace address'>
        <Input value={value} onValueChange={setValue} onBlur={() => setTouched(true)} prefix='https://' />
      </FormField>
    );
  },
};

/** The wrapper is control-agnostic — Select, Textarea, anything. */
export const AnyControl: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <FormField label='Region' helper='Where your data is stored'>
        <Select placeholder='Select region…'>
          <Select.Item value='us-east-1'>us-east-1</Select.Item>
          <Select.Item value='eu-central-1'>eu-central-1</Select.Item>
        </Select>
      </FormField>
      <FormField label='Description' optional helper='A short summary'>
        <Textarea placeholder='What does this project do?' />
      </FormField>
    </div>
  ),
};

export const Disabled: Story = {
  args: { label: 'Workspace URL', helper: 'Contact an admin to change this', disabled: true },
  render: args => (
    <FormField {...args}>
      <Input defaultValue='acme' />
    </FormField>
  ),
};
