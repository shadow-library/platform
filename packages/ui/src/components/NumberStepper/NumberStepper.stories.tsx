/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { NumberStepper } from './NumberStepper';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/NumberStepper',
  component: NumberStepper,
  parameters: { layout: 'centered' },
  argTypes: {
    buttons: { control: 'inline-radio', options: ['split', 'chevrons'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof NumberStepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Split: Story = {
  render: () => {
    const [value, setValue] = useState<number | null>(3);
    return <NumberStepper value={value} onValueChange={setValue} min={1} max={12} step={1} itemLabel='replicas' buttons='split' aria-label='Replicas' />;
  },
};

export const Chevrons: Story = {
  render: () => {
    const [value, setValue] = useState<number | null>(30);
    return <NumberStepper value={value} onValueChange={setValue} min={5} max={300} step={5} unit='sec' itemLabel='timeout' buttons='chevrons' aria-label='Timeout' />;
  },
};
