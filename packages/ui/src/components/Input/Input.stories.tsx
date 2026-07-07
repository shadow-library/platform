/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Input } from './Input';

/**
 * Declaring the constants
 */
function SearchIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <circle cx='7' cy='7' r='4.5' />
      <path d='M10.5 10.5L14 14' />
    </svg>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        padding: '2px 6px',
        borderRadius: 4,
        background: 'var(--sh-surface-well)',
        border: '1px solid var(--sh-border-default)',
        font: 'var(--sh-text-caption)/1 var(--sh-font-mono)',
        fontSize: 10,
        color: 'var(--sh-text-tertiary)',
      }}
    >
      {children}
    </kbd>
  );
}

const meta = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Workspace name', placeholder: 'Acme Corp', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    invalid: { control: 'boolean' },
    clearable: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
  decorators: [
    Story => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive — adjust props from the controls panel. */
export const Playground: Story = {};

export const Sizes: Story = {
  render: args => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Input {...args} size='sm' placeholder='Small' />
      <Input {...args} size='md' placeholder='Medium' />
      <Input {...args} size='lg' placeholder='Large' />
    </div>
  ),
};

/** A node prefix becomes a decorative in-field icon; a string suffix becomes a kbd hint. */
export const WithAdornments: Story = {
  args: { prefix: <SearchIcon />, suffix: <Kbd>⌘K</Kbd>, placeholder: 'Search projects…' },
};

/** A string prefix/suffix fuses as a flat addon segment sharing the field border. */
export const TextAddon: Story = {
  args: { prefix: 'https://', suffix: '.com', placeholder: 'shadow-apps' },
};

/** The × appears once the field has a value and the field is hovered or focused. */
export const Clearable: Story = {
  render: args => {
    const [value, setValue] = useState('acme-corp');
    return <Input {...args} clearable value={value} onValueChange={setValue} prefix={<SearchIcon />} placeholder='Search…' />;
  },
};

/** `type='password'` adds an eye toggle that reveals the entered characters. */
export const Password: Story = {
  args: { type: 'password', defaultValue: 'hunter2', 'aria-label': 'Password', placeholder: 'Password' },
};

/** Danger border and ring — presentation only; the message is rendered by Form Field. */
export const Invalid: Story = {
  args: { invalid: true, defaultValue: 'invalid@' },
};

export const ReadOnly: Story = {
  args: { readOnly: true, value: 'ws_8f3a91c2' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Acme Corp' },
};
