/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Calendar } from './Calendar';
import { type DateRange } from './Calendar.types';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('2026-06-15');
    return <Calendar value={value} onValueChange={next => setValue(next as string | null)} aria-label="Deploy date" />;
  },
};

export const Range: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange>({ start: '2026-06-08', end: '2026-06-14' });
    return <Calendar mode="range" months={2} value={value} onValueChange={next => setValue(next as DateRange)} aria-label="Date range" />;
  },
};

export const Multiple: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['2026-06-03', '2026-06-11', '2026-06-19']);
    return <Calendar mode="multiple" value={value} onValueChange={next => setValue(next as string[])} aria-label="Dates" />;
  },
};
