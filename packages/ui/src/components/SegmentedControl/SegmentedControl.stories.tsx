/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { SegmentedControl } from './SegmentedControl';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  parameters: { layout: 'centered' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md'] }, fullWidth: { control: 'boolean' } },
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => {
    const [period, setPeriod] = useState('1w');
    return (
      <SegmentedControl {...args} value={period} onValueChange={setPeriod} aria-label="Chart period">
        <SegmentedControl.Item value="1d">Day</SegmentedControl.Item>
        <SegmentedControl.Item value="1w">Week</SegmentedControl.Item>
        <SegmentedControl.Item value="1m">Month</SegmentedControl.Item>
      </SegmentedControl>
    );
  },
};

export const FullWidth: Story = {
  render: () => {
    const [layout, setLayout] = useState('grid');
    return (
      <div style={{ width: 320 }}>
        <SegmentedControl fullWidth value={layout} onValueChange={setLayout} aria-label="Layout">
          <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
          <SegmentedControl.Item value="list">List</SegmentedControl.Item>
        </SegmentedControl>
      </div>
    );
  },
};
