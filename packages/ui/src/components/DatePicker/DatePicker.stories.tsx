/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { DatePicker } from './DatePicker';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DatePicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('2026-06-30');
    return <DatePicker value={value} onValueChange={setValue} aria-label="Deploy date" />;
  },
};

export const WithMinMax: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return <DatePicker value={value} onValueChange={setValue} min="2026-06-01" max="2026-06-30" aria-label="In June" />;
  },
};

export const Empty: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return <DatePicker value={value} onValueChange={setValue} aria-label="Pick a date" />;
  },
};
