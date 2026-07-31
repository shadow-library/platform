/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { MultiSelect } from './MultiSelect';
import { type MultiSelectOption } from './MultiSelect.types';

/**
 * Declaring the constants
 */
const teams: MultiSelectOption[] = [
  { value: 'design', label: 'Design' },
  { value: 'platform', label: 'Platform' },
  { value: 'growth', label: 'Growth' },
  { value: 'security', label: 'Security' },
  { value: 'data', label: 'Data' },
  { value: 'support', label: 'Support' },
];

const meta = {
  title: 'Components/MultiSelect',
  component: MultiSelect,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Notify teams', options: teams, placeholder: 'Select teams…', size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
    searchable: { control: 'boolean' },
    selectAll: { control: 'boolean' },
    clearable: { control: 'boolean' },
    maxVisibleTags: { control: { type: 'number', min: 1, max: 6 } },
    maxSelected: { control: { type: 'number', min: 1, max: 6 } },
  },
  decorators: [
    Story => (
      <div style={{ width: 300 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MultiSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

function Interactive(args: React.ComponentProps<typeof MultiSelect>) {
  const [value, setValue] = useState<string[]>(args.value ?? []);
  return <MultiSelect {...args} value={value} onValueChange={setValue} />;
}

/** Interactive — check several, remove via tag ×, overflow past 3, clear all. */
export const Playground: Story = {
  render: args => <Interactive {...args} value={['design', 'platform']} />,
};

/** A pinned search filters options while preserving checked state. */
export const Searchable: Story = {
  render: args => <Interactive {...args} searchable value={['design']} />,
};

/** A leading “Select all” row with an indeterminate partial state. */
export const SelectAll: Story = {
  render: args => <Interactive {...args} selectAll value={['design', 'growth']} />,
};

/** Remaining options disable once the cap is reached; the footer explains why. */
export const MaxSelected: Story = {
  render: args => <Interactive {...args} maxSelected={2} value={['design', 'platform']} />,
};

export const Sizes: Story = {
  render: args => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <Interactive key={size} {...args} size={size} value={['design', 'platform']} />
      ))}
    </div>
  ),
};

export const Invalid: Story = {
  render: args => <Interactive {...args} invalid />,
};

export const Disabled: Story = {
  render: args => <Interactive {...args} disabled value={['design', 'platform']} />,
};
