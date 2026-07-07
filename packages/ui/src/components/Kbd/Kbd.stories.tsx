/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Kbd } from './Kbd';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
  args: { keys: 'mod+K' },
  argTypes: { bare: { control: 'boolean' }, mac: { control: 'boolean' } },
} satisfies Meta<typeof Kbd>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Combinations: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Kbd keys='mod+K' />
      <Kbd keys='mod+shift+P' />
      <Kbd keys='ctrl+alt+delete' />
      <Kbd keys='esc' />
      <Kbd keys='up' />
    </div>
  ),
};

/** Bare glyphs for tooltips and menu rows. */
export const Bare: Story = {
  args: { bare: true, keys: 'mod+shift+D' },
};
