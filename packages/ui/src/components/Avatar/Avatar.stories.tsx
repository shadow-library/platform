/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Avatar, AvatarGroup } from './Avatar';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  args: { name: 'Maya Kim', size: 'md', shape: 'circle' },
  argTypes: {
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    shape: { control: 'inline-radio', options: ['circle', 'square'] },
    presence: { control: 'inline-radio', options: [undefined, 'online', 'offline', 'away', 'busy'] },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
      <Avatar name='Maya Kim' size='xs' />
      <Avatar name='Maya Kim' size='sm' />
      <Avatar name='Maya Kim' size='md' />
      <Avatar name='Maya Kim' size='lg' />
      <Avatar name='Maya Kim' size='xl' />
    </div>
  ),
};

/** Circle for people, radius-6 square for workspaces/orgs. */
export const Shapes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Avatar name='Maya Kim' size='lg' />
      <Avatar name='Acme Corp' size='lg' shape='square' />
    </div>
  ),
};

export const Presence: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <Avatar name='Ana Ng' size='lg' presence='online' />
      <Avatar name='Ravi Sun' size='lg' presence='away' />
      <Avatar name='Jo Tan' size='lg' presence='busy' />
      <Avatar name='Kim Lee' size='lg' presence='offline' />
    </div>
  ),
};

/** Stacked group with a "+N" overflow counter. */
export const Group: Story = {
  render: () => (
    <AvatarGroup max={4}>
      <Avatar name='Maya Kim' />
      <Avatar name='Jo Tan' />
      <Avatar name='Ravi Sun' />
      <Avatar name='Ana Ng' />
      <Avatar name='Kim Lee' />
      <Avatar name='Sam Fox' />
    </AvatarGroup>
  ),
};
