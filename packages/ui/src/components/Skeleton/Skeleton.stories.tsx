/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Skeleton } from './Skeleton';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Compose primitives to ghost any layout. */
export const Primitives: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 280 }}>
      <Skeleton shape='line' width='70%' />
      <Skeleton shape='line' width='90%' />
      <Skeleton shape='line' width='50%' />
      <Skeleton shape='circle' width={40} />
      <Skeleton shape='rect' width='100%' height={80} />
    </div>
  ),
};

export const TablePreset: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <Skeleton.Table rows={5} columns={4} />
    </div>
  ),
};

export const ListPreset: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <Skeleton.List rows={4} />
    </div>
  ),
};

export const CardPreset: Story = {
  render: () => (
    <div style={{ width: 260 }}>
      <Skeleton.Card />
    </div>
  ),
};
