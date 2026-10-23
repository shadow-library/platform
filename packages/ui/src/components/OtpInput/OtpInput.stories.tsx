import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { OtpInput } from './OtpInput';

const meta = {
  title: 'Components/OtpInput',
  component: OtpInput,
  parameters: { layout: 'centered' },
  args: { length: 6, type: 'numeric', size: 'md' },
  argTypes: {
    length: { control: { type: 'number', min: 2, max: 10 } },
    type: { control: 'inline-radio', options: ['numeric', 'alphanumeric', 'alphabetic'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    mask: { control: 'boolean' },
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof OtpInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: args => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <OtpInput {...args} size="sm" />
      <OtpInput {...args} size="md" />
      <OtpInput {...args} size="lg" />
    </div>
  ),
};

export const Alphanumeric: Story = {
  args: { type: 'alphanumeric', length: 5, defaultValue: 'A1B2C' },
};

export const Masked: Story = {
  args: { mask: true, defaultValue: '482913' },
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: '000000' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: '123456' },
};

export const WithOnComplete: Story = {
  render: args => {
    const [value, setValue] = useState('');
    const [done, setDone] = useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <OtpInput {...args} value={value} onValueChange={setValue} onComplete={() => setDone(true)} />
        <span style={{ fontSize: 'var(--sh-text-body-sm)', color: done ? 'var(--sh-success-text)' : 'var(--sh-text-tertiary)' }}>
          {done ? 'Code complete' : `Entered: ${value || '—'}`}
        </span>
      </div>
    );
  },
};
