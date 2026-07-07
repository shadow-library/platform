/**
 * Importing npm packages
 */

import { type Meta, type StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

/**
 * Importing user defined packages
 */
import { TreeView } from './TreeView';
import { type TreeNode } from './TreeView.types';

/**
 * Declaring the constants
 */
const tree: TreeNode[] = [
  {
    id: 'eng',
    label: 'Engineering',
    children: [
      {
        id: 'platform',
        label: 'Platform',
        children: [
          { id: 'checkout', label: 'checkout-service' },
          { id: 'billing-svc', label: 'billing-service' },
        ],
      },
      { id: 'design-sys', label: 'Design System' },
    ],
  },
  { id: 'design', label: 'Design', children: [{ id: 'brand', label: 'Brand' }] },
  { id: 'ops', label: 'Operations' },
];

const meta = {
  title: 'Components/TreeView',
  component: TreeView,
  parameters: { layout: 'padded' },
  args: { nodes: tree },
  decorators: [
    Story => (
      <div style={{ maxWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreeView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Selection: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['platform']);
    return <TreeView nodes={tree} defaultExpanded={['eng', 'platform']} selected={selected} onSelectedChange={setSelected} aria-label='Organization' />;
  },
};

export const Checkboxes: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['checkout']);
    return <TreeView nodes={tree} checkboxes defaultExpanded={['eng', 'platform']} selected={selected} onSelectedChange={setSelected} aria-label='Scope' />;
  },
};
