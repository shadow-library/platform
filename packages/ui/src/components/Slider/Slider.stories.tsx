/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Slider } from './Slider';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Slider',
  component: Slider,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Slider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Continuous: Story = {
  render: () => {
    const [value, setValue] = useState<number | number[]>(40);
    return <Slider value={value} onValueChange={setValue} min={0} max={100} step={1} unit='%' label='Opacity' aria-label='Opacity' />;
  },
};

export const Stepped: Story = {
  render: () => {
    const [value, setValue] = useState<number | number[]>(4);
    return <Slider value={value} onValueChange={setValue} min={0} max={8} step={1} marks label='Sampling rate' aria-label='Sampling rate' />;
  },
};

export const Range: Story = {
  render: () => {
    const [value, setValue] = useState<number | number[]>([20, 80]);
    return <Slider value={value} onValueChange={setValue} min={0} max={100} step={5} unit='%' label='Price range' aria-label='Price range' />;
  },
};
