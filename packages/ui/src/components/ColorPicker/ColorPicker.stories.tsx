/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { ColorPicker } from './ColorPicker';

/**
 * Declaring the constants
 */
const meta = {
  title: 'Components/ColorPicker',
  component: ColorPicker,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ColorPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('#4f46e5');
    return <ColorPicker value={value} onValueChange={setValue} aria-label="Brand color" />;
  },
};

export const CustomPalette: Story = {
  render: () => {
    const [value, setValue] = useState('#0ea5e9');
    return (
      <ColorPicker
        value={value}
        onValueChange={setValue}
        aria-label="Label color"
        palette={[
          { label: 'Sky', value: '#0ea5e9' },
          { label: 'Team purple', value: '#7c3aed' },
          { label: 'Forest', value: '#166534' },
          { label: 'Coral', value: '#f97316' },
        ]}
      />
    );
  },
};

export const PaletteOnly: Story = {
  render: () => {
    const [value, setValue] = useState('#16a34a');
    return <ColorPicker value={value} onValueChange={setValue} allowCustom={false} aria-label="Status color" />;
  },
};

export const SpectrumOnly: Story = {
  render: () => {
    const [value, setValue] = useState('#4f46e5');
    return <ColorPicker value={value} onValueChange={setValue} palette={[]} aria-label="Theme color" />;
  },
};

export const WithContrastGuard: Story = {
  render: () => {
    const [value, setValue] = useState('#4f46e5');
    return <ColorPicker value={value} onValueChange={setValue} onCommit={setValue} contrastAgainst="#ffffff" aria-label="Label background" />;
  },
};
