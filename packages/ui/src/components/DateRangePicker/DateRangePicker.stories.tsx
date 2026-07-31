/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { type DateRange } from '../Calendar';
import { DateRangePicker } from './DateRangePicker';

/**
 * Declaring the constants
 */
const presets = [
  { label: 'Last 7 days', range: { start: '2026-06-01', end: '2026-06-07' } },
  { label: 'Last 30 days', range: { start: '2026-05-09', end: '2026-06-07' } },
  { label: 'This month', range: { start: '2026-06-01', end: '2026-06-30' } },
];

const meta = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DateRangePicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithPresets: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange>({ start: '2026-06-08', end: '2026-06-14' });
    return <DateRangePicker value={value} onValueChange={setValue} presets={presets} aria-label="Report period" />;
  },
};

export const Confirm: Story = {
  render: () => {
    const [value, setValue] = useState<DateRange>({ start: null, end: null });
    return <DateRangePicker value={value} onValueChange={setValue} presets={presets} confirm aria-label="Query period" />;
  },
};
