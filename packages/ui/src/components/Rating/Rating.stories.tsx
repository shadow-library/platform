/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Rating } from './Rating';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Rating',
  component: Rating,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Rating>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Input: Story = {
  render: () => {
    const [value, setValue] = useState(0);
    return <Rating value={value} onValueChange={setValue} labels={['Terrible', 'Poor', 'Average', 'Good', 'Excellent']} aria-label="How was it?" />;
  },
};

export const Display: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Rating value={4.3} readOnly reviewCount={128} size="sm" />
      <Rating value={3.5} readOnly size="md" />
      <Rating value={5} readOnly size="lg" />
    </div>
  ),
};
