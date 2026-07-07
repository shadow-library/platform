/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { DropdownMenu } from './DropdownMenu';

/**
 * Declaring the constants
 */
function PlusIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M8 3v10M3 8h10' />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
      <rect x='5' y='5' width='8' height='8' rx='1.5' />
      <path d='M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5H5' />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8' />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
      <circle cx='3' cy='8' r='1.3' />
      <circle cx='8' cy='8' r='1.3' />
      <circle cx='13' cy='8' r='1.3' />
    </svg>
  );
}

const meta = {
  title: 'Components/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DropdownMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The full menu: actions with shortcuts, a disabled item, a checkbox section, and a destructive zone. */
export const Playground: Story = {
  render: () => {
    const [compact, setCompact] = useState(true);
    return (
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button suffix={<ChevronDown />}>Actions</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item icon={<PlusIcon />} shortcut='⌘N'>
            New run
          </DropdownMenu.Item>
          <DropdownMenu.Item icon={<CopyIcon />} shortcut='⌘D'>
            Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled icon={<CopyIcon />}>
            Rename
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Label>View</DropdownMenu.Label>
          <DropdownMenu.CheckboxItem checked={compact} onCheckedChange={setCompact}>
            Compact rows
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator />
          <DropdownMenu.Item destructive icon={<TrashIcon />}>
            Delete run…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    );
  },
};

/** The common “···” more menu behind an Icon Button. */
export const IconTrigger: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IconButton icon={<MoreIcon />} aria-label='Row actions' />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item icon={<CopyIcon />}>Duplicate</DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item destructive icon={<TrashIcon />}>
          Delete…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  ),
};

/** A radio group for an exclusive choice (sort order); the menu stays open on select. */
export const RadioGroup: Story = {
  render: () => {
    const [sort, setSort] = useState('name');
    return (
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button suffix={<ChevronDown />}>Sort: {sort}</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Label>Sort by</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={sort} onValueChange={setSort}>
            <DropdownMenu.RadioItem value='name'>Name</DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value='date'>Date modified</DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value='size'>Size</DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu>
    );
  },
};

/** One level of submenu, opening at the parent edge. */
export const Submenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button suffix={<ChevronDown />}>Actions</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item icon={<CopyIcon />}>Duplicate</DropdownMenu.Item>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger icon={<PlusIcon />}>Add to project</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.Item>Shadow UI</DropdownMenu.Item>
            <DropdownMenu.Item>Internal Tools</DropdownMenu.Item>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu>
  ),
};

function ChevronDown() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' width={16} height={16}>
      <path d='M4 6.5L8 10.5L12 6.5' />
    </svg>
  );
}
