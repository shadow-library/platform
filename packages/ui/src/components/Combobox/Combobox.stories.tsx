/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { Avatar } from '../Avatar';
import { Combobox } from './Combobox';
import { type ComboboxOption } from './Combobox.types';

/**
 * Declaring the constants
 */
const people: ComboboxOption[] = [
  { value: '1', label: 'Maya Kim', description: 'Platform', media: <Avatar size='xs' name='Maya Kim' /> },
  { value: '2', label: 'Jo Tan', description: 'Billing', media: <Avatar size='xs' name='Jo Tan' /> },
  { value: '3', label: 'Ravi Sun', description: 'Search', media: <Avatar size='xs' name='Ravi Sun' /> },
  { value: '4', label: 'Ana Ng', description: 'Growth', media: <Avatar size='xs' name='Ana Ng' /> },
];

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Rich rows with avatar + description. */
export const Default: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return <Combobox options={people} value={value} onValueChange={setValue} placeholder='Search people…' aria-label='Owner' />;
  },
};

/** Plain options, no media. */
export const Plain: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('2');
    const options = people.map(({ value: v, label }) => ({ value: v, label }));
    return <Combobox options={options} value={value} onValueChange={setValue} placeholder='Search…' aria-label='Owner' />;
  },
};

/** Creatable taxonomy picker. */
export const Creatable: Story = {
  render: () => {
    const [options, setOptions] = useState<ComboboxOption[]>([
      { value: 'design', label: 'design' },
      { value: 'infra', label: 'infra' },
    ]);
    const [value, setValue] = useState<string | null>(null);
    return (
      <Combobox
        options={options}
        value={value}
        onValueChange={setValue}
        creatable
        onCreate={query => {
          setOptions(list => [...list, { value: query, label: query }]);
          setValue(query);
        }}
        placeholder='Add a label…'
        aria-label='Label'
      />
    );
  },
};
