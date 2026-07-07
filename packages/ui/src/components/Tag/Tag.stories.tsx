/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Tag } from './Tag';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/Tag',
  component: Tag,
  parameters: { layout: 'centered' },
  args: { children: 'design', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    color: { control: 'color' },
  },
} satisfies Meta<typeof Tag>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithSwatch: Story = {
  args: { color: '#4F46E5', children: 'design-system' },
};

/** Clickable tag renders a real link via asChild. */
export const Clickable: Story = {
  render: () => (
    <Tag asChild>
      <a href='#topics'>infrastructure</a>
    </Tag>
  ),
};

/** A removable row that wraps with a small gap. */
export const RemovableRow: Story = {
  render: () => {
    const [tags, setTags] = useState(['design', 'frontend', 'q3-launch', 'billing']);
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
        {tags.map(tag => (
          <Tag key={tag} onRemove={() => setTags(list => list.filter(t => t !== tag))}>
            {tag}
          </Tag>
        ))}
      </div>
    );
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Tag size='sm'>small</Tag>
      <Tag size='md'>medium</Tag>
      <Tag size='lg'>large</Tag>
    </div>
  ),
};
