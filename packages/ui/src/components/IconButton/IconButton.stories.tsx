/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { IconButton } from './IconButton';

/**
 * Declaring the constants
 */
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z" />
    </svg>
  );
}

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  parameters: { layout: 'centered' },
  args: { icon: <PlusIcon />, 'aria-label': 'Add', variant: 'ghost', size: 'md' },
  argTypes: {
    icon: { control: false },
    variant: { control: 'select', options: ['ghost', 'secondary', 'primary', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — adjust props from the controls panel. */
export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <IconButton icon={<SearchIcon />} aria-label="Search" variant="ghost" />
      <IconButton icon={<SearchIcon />} aria-label="Search" variant="secondary" />
      <IconButton icon={<PlusIcon />} aria-label="Add" variant="primary" />
      <IconButton icon={<TrashIcon />} aria-label="Delete" variant="danger" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <IconButton icon={<MoreIcon />} aria-label="More options" size="sm" />
      <IconButton icon={<MoreIcon />} aria-label="More options" size="md" />
      <IconButton icon={<MoreIcon />} aria-label="More options" size="lg" />
    </div>
  ),
};

/** Pass `pressed` to switch to toggle semantics — the icon may also swap outline → filled. */
export const Toggle: Story = {
  render: () => {
    const [pinned, setPinned] = useState(false);
    return <IconButton icon={<StarIcon filled={pinned} />} aria-label={pinned ? 'Unpin' : 'Pin'} pressed={pinned} onClick={() => setPinned(p => !p)} />;
  },
};

export const Loading: Story = {
  args: { variant: 'secondary', loading: true, 'aria-label': 'Saving' },
};

export const Disabled: Story = {
  args: { variant: 'secondary', disabled: true },
};

/** A toolbar row — ghost buttons stay quiet against content. */
export const Toolbar: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: 4, border: '1px solid var(--sh-border-default)', borderRadius: 'var(--sh-radius-lg)' }}>
      <IconButton icon={<SearchIcon />} aria-label="Search" />
      <IconButton icon={<PlusIcon />} aria-label="Add" />
      <IconButton icon={<MoreIcon />} aria-label="More options" />
    </div>
  ),
};
