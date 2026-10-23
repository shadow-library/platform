import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Textarea } from './Textarea';

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

export const Playground: Story = {};

export const AutoGrow: Story = {
  render: args => {
    const [value, setValue] = useState('Shadow UI powers every internal tool at Acme.\nType more lines to watch it grow…');
    return <Textarea {...args} value={value} onValueChange={setValue} />;
  },
};

export const ManualResize: Story = {
  args: { autoGrow: false, minRows: 4 },
};

export const Mono: Story = {
  args: { mono: true, wrap: 'off', autoGrow: false, minRows: 6, defaultValue: '{\n  "aliases": [\n    { "key": "fast", "model": "gpt-4o-mini", "state": "active" }\n  ]\n}' },
};

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
