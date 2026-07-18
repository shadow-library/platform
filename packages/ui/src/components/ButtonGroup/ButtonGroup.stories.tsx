/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';

/**
 * Importing user defined packages
 */
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { ButtonGroup } from './ButtonGroup';

/**
 * Declaring the constants
 */
function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
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

const meta = {
  title: 'Components/ButtonGroup',
  component: ButtonGroup,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'text', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    attached: { control: 'boolean' },
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — the group's `variant`/`size` flow to every member. */
export const Playground: Story = {
  args: { 'aria-label': 'Zoom', variant: 'secondary', size: 'md' },
  render: args => (
    <ButtonGroup {...args}>
      <Button>Zoom out</Button>
      <Button>100%</Button>
      <Button>Zoom in</Button>
    </ButtonGroup>
  ),
};

/** Symmetric peer actions fused into one control — Secondary, shared 1px borders. */
export const Attached: Story = {
  render: () => (
    <ButtonGroup aria-label="History">
      <Button>Undo</Button>
      <Button>Redo</Button>
    </ButtonGroup>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <ButtonGroup aria-label="Zoom small" size="sm">
        <Button>Out</Button>
        <Button>In</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Zoom medium" size="md">
        <Button>Out</Button>
        <Button>In</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Zoom large" size="lg">
        <Button>Out</Button>
        <Button>In</Button>
      </ButtonGroup>
    </div>
  ),
};

/** The outer corners follow the axis; inner corners stay square. */
export const Vertical: Story = {
  render: () => (
    <ButtonGroup aria-label="Alignment" orientation="vertical">
      <Button>Top</Button>
      <Button>Middle</Button>
      <Button>Bottom</Button>
    </ButtonGroup>
  ),
};

/** Ghost icon buttons at a 4px gap with `role="toolbar"` — one tab stop, arrow keys move within. */
export const Toolbar: Story = {
  render: () => (
    <ButtonGroup role="toolbar" aria-label="Row actions" attached={false}>
      <IconButton icon={<SearchIcon />} aria-label="Search" />
      <IconButton icon={<PlusIcon />} aria-label="Add" />
      <IconButton icon={<MoreIcon />} aria-label="More" />
    </ButtonGroup>
  ),
};

/** The container dims once and the whole subtree becomes inert. */
export const Disabled: Story = {
  render: () => (
    <ButtonGroup aria-label="History" disabled>
      <Button>Undo</Button>
      <Button>Redo</Button>
    </ButtonGroup>
  ),
};
