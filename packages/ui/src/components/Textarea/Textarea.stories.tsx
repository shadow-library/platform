/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Textarea } from './Textarea';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Textarea',
  component: Textarea,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Description', placeholder: 'What does this project do?', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    autoGrow: { control: 'boolean' },
    showCount: { control: 'boolean' },
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    minRows: { control: { type: 'number', min: 1, max: 12 } },
    maxRows: { control: { type: 'number', min: 1, max: 20 } },
  },
  decorators: [
    Story => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — type to watch auto-grow between the row bounds. */
export const Playground: Story = {};

/** The default: height follows content from `minRows` up to `maxRows`, then scrolls. */
export const AutoGrow: Story = {
  render: args => {
    const [value, setValue] = useState('Shadow UI powers every internal tool at Acme.\nType more lines to watch it grow…');
    return <Textarea {...args} value={value} onValueChange={setValue} />;
  },
};

/** Fixed height with a vertical drag handle — for code, logs, and JSON. */
export const ManualResize: Story = {
  args: { autoGrow: false, minRows: 4 },
};

/** The counter stays hidden until 80% of `maxLength`, then turns danger at the limit. */
export const WithCounter: Story = {
  render: args => {
    const [value, setValue] = useState('Great for quick feedback that stays within a tight limit.');
    return <Textarea {...args} showCount maxLength={80} value={value} onValueChange={setValue} />;
  },
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: 'This entry has a problem.' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, value: 'Generated release notes — read only.' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Ships the design system.' },
};
