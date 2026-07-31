/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Progress } from './Progress';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Progress',
  component: Progress,
  parameters: { layout: 'padded' },
  args: { value: 64, max: 100, label: 'Re-indexing' },
  argTypes: {
    intent: { control: 'inline-radio', options: ['accent', 'success', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    indeterminate: { control: 'boolean' },
  },
  decorators: [
    Story => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Labeled: Story = {};

export const Bare: Story = { args: { label: undefined, value: 40 } };

export const Complete: Story = { args: { value: 100, intent: 'success', label: 'Deployed' } };

export const Indeterminate: Story = { args: { indeterminate: true, label: 'Deploying…' } };
